import os
import time
import uuid
import requests

from creatives import comfy



def submit(workflow):
    comfy.require_online()
    response = comfy.post(
        "/prompt",
        json={"prompt": workflow},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    if "prompt_id" not in data:
        raise Exception(f"ComfyUI error:\n{data}")
    return data["prompt_id"]


def wait(prompt_id, max_minutes=20):
    """Poll ComfyUI until job is actually completed (not just queued)."""
    deadline = time.time() + (max_minutes * 60)
    found_count = 0  # how many times we've seen this job

    while time.time() < deadline:
        try:
            response = comfy.get(
                f"/history/{prompt_id}",
                timeout=30,
            )
            response.raise_for_status()
            history = response.json()

            if prompt_id in history:
                job = history[prompt_id]
                outputs = job.get("outputs", {})
                status = job.get("status", {})
                completed = status.get("completed", False)
                status_str = status.get("status_str", "")

                found_count += 1

                print(f"[wait] poll #{found_count}: completed={completed}, status={status_str}, outputs={bool(outputs)}")

                # Only return when truly done
                if completed and outputs:
                    print(f"[wait] Job finished with outputs!")
                    return job

                # Also return if status says completed even without outputs
                if status_str in ("success", "error") and found_count > 1:
                    print(f"[wait] Job status={status_str}, returning.")
                    return job

        except Exception as e:
            print(f"[wait] poll error (retrying): {e}")

        time.sleep(3)

    raise Exception(
        f"ComfyUI timed out after {max_minutes} minutes for prompt_id={prompt_id}"
    )


def push_image(image_path):
    """Send the starting picture to ComfyUI. It can be a file on the server or a web address
    (pictures made on the Creatives page are stored online)."""
    comfy.require_online()
    if image_path.startswith("http"):
        data = requests.get(image_path, timeout=60)
        data.raise_for_status()
        content = data.content
        ext = os.path.splitext(image_path.split("?")[0])[1] or ".jpg"
    else:
        with open(image_path, "rb") as f:
            content = f.read()
        ext = os.path.splitext(image_path)[1] or ".jpg"
    new_filename = f"{uuid.uuid4()}{ext}"
    response = comfy.post(
        "/upload/image",
        files={"image": (new_filename, content, "image/jpeg")},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["name"]