import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Sparkles, Mail, Lock, User, Eye, EyeOff } from "lucide-react";

const N = {
  card: {
    background: "var(--neu-base)",
    boxShadow: "10px 10px 24px #D5C1C3, -10px -10px 24px #FFFFFF",
    borderRadius: "1.5rem",
    border: "none",
  },
  input: {
    background: "var(--neu-base)",
    boxShadow: "inset 3px 3px 7px var(--neu-dark), inset -3px -3px 7px #FFFFFF",
    borderRadius: "0.75rem",
    border: "none",
    color: "var(--foreground, #1A2324)",
  },
  btn: {
    background: "#13585B",
    boxShadow: "3px 3px 8px #C4ACAF, -2px -2px 6px #FFFFFF",
    borderRadius: "0.75rem",
    border: "none",
    color: "white",
    cursor: "pointer",
    transition: "box-shadow 0.15s ease, transform 0.1s ease",
  },
};

type Mode = "login" | "signup" | "forgot";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setSuccess("Check your email to confirm your account!");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSuccess("Password reset email sent! Check your inbox.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--neu-base)" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "#13585B",
              boxShadow: "6px 6px 14px var(--neu-dark), -6px -6px 14px #FFFFFF",
            }}
          >
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-semibold" style={{ color: "var(--foreground, #1A2324)" }}>
            Custom Holidays
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground, #5B6766)" }}>
            {mode === "login" && "Sign in to your workspace"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Reset your password"}
          </p>
        </div>

        {/* Card */}
        <div className="p-8" style={N.card}>
          <div className="space-y-4">
            {/* Full name — signup only */}
            {mode === "signup" && (
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "var(--muted-foreground, #5B6766)" }}
                />
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm outline-none"
                  style={N.input}
                />
              </div>
            )}

            {/* Email */}
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: "var(--muted-foreground, #5B6766)" }}
              />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                className="w-full pl-10 pr-4 py-3 text-sm outline-none"
                style={N.input}
              />
            </div>

            {/* Password — not for forgot */}
            {mode !== "forgot" && (
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "var(--muted-foreground, #5B6766)" }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  className="w-full pl-10 pr-10 py-3 text-sm outline-none"
                  style={N.input}
                />
                <button
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground, #5B6766)" }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}

            {/* Error / Success */}
            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#E05A5A", background: "rgba(224,90,90,0.08)" }}>
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#52A882", background: "rgba(82,168,130,0.08)" }}>
                {success}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 text-sm font-semibold transition-all"
              style={{ ...N.btn, opacity: loading ? 0.7 : 1 }}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : mode === "signup"
                ? "Create Account"
                : "Send Reset Email"}
            </button>
          </div>

          {/* Footer links */}
          <div className="mt-6 text-center space-y-2">
            {mode === "login" && (
              <>
                <button
                  onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }}
                  className="block w-full text-xs"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground, #5B6766)" }}
                >
                  Forgot password?
                </button>
                <p className="text-xs" style={{ color: "var(--muted-foreground, #5B6766)" }}>
                  Don't have an account?{" "}
                  <button
                    onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#13585B", fontWeight: 500 }}
                  >
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p className="text-xs" style={{ color: "var(--muted-foreground, #5B6766)" }}>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#13585B", fontWeight: 500 }}
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === "forgot" && (
              <button
                onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                className="text-xs"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#13585B" }}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--neu-dark)" }}>
          Powered by <span style={{ color: "var(--muted-foreground, #5B6766)" }}>Custom Holidays</span>
        </p>
      </div>
    </div>
  );
}