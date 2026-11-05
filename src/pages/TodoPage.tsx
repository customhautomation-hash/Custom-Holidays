import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Check, Circle, Calendar,
  Flag, ChevronDown, X, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ──────────────────────────────────────────────────
type Priority = "low" | "medium" | "high";
type Category = "General" | "Operations" | "Sales" | "Content" | "Finance" | "Suppliers";

interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
  category: Category;
  due?: string;
  createdAt: string;
}

const STORAGE_KEY = "ch_todos_v1";

const priorityConfig: Record<Priority, { label: string; color: string; dot: string }> = {
  low:    { label: "Low",    color: "text-zinc-400",  dot: "bg-zinc-400"  },
  medium: { label: "Medium", color: "text-amber-400", dot: "bg-amber-400" },
  high:   { label: "High",   color: "text-red-400",   dot: "bg-red-400"   },
};

const categories: Category[] = ["General", "Operations", "Sales", "Content", "Finance", "Suppliers"];

const categoryColors: Record<Category, string> = {
  General:    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  Operations: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Sales:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Content:    "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Finance:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Suppliers:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const genId = () => Math.random().toString(36).slice(2);

// ── Todo Item ──────────────────────────────────────────────
const TodoItem = ({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const p = priorityConfig[todo.priority];
  const isOverdue = todo.due && !todo.done && new Date(todo.due) < new Date();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors group ${
        todo.done
          ? "border-border/50 bg-muted/20 opacity-60"
          : "border-border bg-card hover:bg-muted/20"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id)}
        className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          todo.done
            ? "border-fuchsia-500 bg-fuchsia-500"
            : "border-border hover:border-fuchsia-400"
        }`}
      >
        {todo.done && <Check className="h-3 w-3 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed break-words ${todo.done ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
          {todo.text}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Priority dot */}
          <div className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
            <span className={`text-[11px] font-medium ${p.color}`}>{p.label}</span>
          </div>

          {/* Category */}
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full border font-medium ${categoryColors[todo.category]}`}>
            {todo.category}
          </span>

          {/* Due date */}
          {todo.due && (
            <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? "text-red-400" : "text-muted-foreground"}`}>
              <Calendar className="h-2.5 w-2.5" />
              {new Date(todo.due).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              {isOverdue && " · Overdue"}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 mt-0.5 shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
};

// ── Main Page ──────────────────────────────────────────────
export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [text,           setText]           = useState("");
  const [priority,       setPriority]       = useState<Priority>("medium");
  const [category,       setCategory]       = useState<Category>("General");
  const [due,            setDue]            = useState("");
  const [filterCategory, setFilterCategory] = useState<Category | "All">("All");
  const [filterDone,     setFilterDone]     = useState<"all" | "active" | "done">("all");
  const [showForm,       setShowForm]       = useState(false);
  const [priorityOpen,   setPriorityOpen]   = useState(false);
  const [categoryOpen,   setCategoryOpen]   = useState(false);

  const priorityRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);

  /* persist */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  /* close dropdowns on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node))
        setPriorityOpen(false);
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node))
        setCategoryOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addTodo = () => {
    if (!text.trim()) return;
    setTodos(prev => [{
      id: genId(),
      text: text.trim(),
      done: false,
      priority,
      category,
      due: due || undefined,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setText(""); setDue(""); setPriority("medium"); setCategory("General");
    setShowForm(false);
  };

  const toggleTodo = (id: string) =>
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const deleteTodo = (id: string) =>
    setTodos(prev => prev.filter(t => t.id !== id));

  const clearDone = () =>
    setTodos(prev => prev.filter(t => !t.done));

  const filtered = todos.filter(t => {
    if (filterCategory !== "All" && t.category !== filterCategory) return false;
    if (filterDone === "active" && t.done)  return false;
    if (filterDone === "done"   && !t.done) return false;
    return true;
  });

  const active = todos.filter(t => !t.done).length;
  const done   = todos.filter(t =>  t.done).length;

  return (
    <DashboardLayout>
      {/*
        Fills the height DashboardLayout hands it (assumes DashboardLayout's
        content slot is a flex/height-constrained container). Header and
        filters are fixed; only the task list scrolls, so the page no longer
        grows past the viewport or leaves a floating/short column on tall
        screens.
      */}
      <div className="flex flex-col h-full min-h-0 w-full p-6">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0 pb-5">
          <div>
            <h1 className="text-2xl font-semibold text-card-foreground">Todo</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {active} active · {done} completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {done > 0 && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8" onClick={clearDone}>
                Clear done
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 text-xs bg-primary hover:opacity-90 text-white gap-1.5"
              onClick={() => setShowForm(v => !v)}
            >
              {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showForm ? "Cancel" : "Add Task"}
            </Button>
          </div>
        </div>

        {/* Add form
            ⚠️  No overflow-hidden here — it would clip the dropdowns.
                Height animation handled by max-height instead.         */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, maxHeight: 0 }}
              animate={{ opacity: 1, maxHeight: 300 }}
              exit={{ opacity: 0, maxHeight: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0"
              style={{ overflow: "visible" }}   /* must stay visible so dropdowns escape */
            >
              <div className="rounded-xl border border-fuchsia-200/30 bg-card p-4 space-y-3 mb-3">
                <Input
                  autoFocus
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTodo()}
                  placeholder="What needs to be done?"
                  className="text-sm"
                />

                <div className="flex items-center gap-2 flex-wrap">

                  {/* ── Priority dropdown ── */}
                  <div ref={priorityRef} className="relative" style={{ zIndex: 999 }}>
                    <button
                      onClick={() => { setPriorityOpen(v => !v); setCategoryOpen(false); }}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <Flag className={`h-3 w-3 ${priorityConfig[priority].color}`} />
                      {priorityConfig[priority].label}
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${priorityOpen ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {priorityOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0,  scale: 1    }}
                          exit={{    opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.12 }}
                          className="absolute top-full left-0 mt-1.5 w-32 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
                          style={{ zIndex: 9999 }}
                        >
                          {(["low", "medium", "high"] as Priority[]).map(p => (
                            <button
                              key={p}
                              onClick={() => { setPriority(p); setPriorityOpen(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted/50 transition-colors ${priority === p ? "bg-muted" : ""}`}
                            >
                              <div className={`h-2 w-2 rounded-full ${priorityConfig[p].dot}`} />
                              <span className={priorityConfig[p].color}>{priorityConfig[p].label}</span>
                              {priority === p && <Check className="h-3 w-3 ml-auto text-fuchsia-500" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ── Category dropdown ── */}
                  <div ref={categoryRef} className="relative" style={{ zIndex: 998 }}>
                    <button
                      onClick={() => { setCategoryOpen(v => !v); setPriorityOpen(false); }}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      {category}
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {categoryOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0,  scale: 1    }}
                          exit={{    opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.12 }}
                          className="absolute top-full left-0 mt-1.5 w-40 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
                          style={{ zIndex: 9999 }}
                        >
                          {categories.map(cat => (
                            <button
                              key={cat}
                              onClick={() => { setCategory(cat); setCategoryOpen(false); }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-muted/50 transition-colors ${category === cat ? "bg-muted" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  cat === "General"    ? "bg-zinc-400"    :
                                  cat === "Operations" ? "bg-blue-400"    :
                                  cat === "Sales"      ? "bg-emerald-400" :
                                  cat === "Content"    ? "bg-teal-400"  :
                                  cat === "Finance"    ? "bg-amber-400"   :
                                                        "bg-orange-400"
                                }`} />
                                <span className="text-card-foreground">{cat}</span>
                              </div>
                              {category === cat && <Check className="h-3 w-3 text-fuchsia-500" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Due date */}
                  <input
                    type="date"
                    value={due}
                    onChange={e => setDue(e.target.value)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 transition-colors focus:outline-none focus:border-fuchsia-400"
                  />

                  <Button
                    size="sm"
                    className="h-7 px-4 text-xs bg-fuchsia-500 hover:bg-fuchsia-600 text-white ml-auto"
                    onClick={addTodo}
                    disabled={!text.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content panel — fills all remaining page height/width */}
        <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-border bg-card/40 p-5">

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap shrink-0 pb-5">
            {/* Status filter */}
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              {(["all", "active", "done"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterDone(f)}
                  className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                    filterDone === f
                      ? "bg-muted text-card-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-1 flex-wrap">
              {(["All", ...categories] as (Category | "All")[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    filterCategory === cat
                      ? "border-fuchsia-400 text-fuchsia-400 bg-fuchsia-400/10"
                      : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Todo list — the only scrollable region on the page, fills remaining panel space */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 -mr-1">
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                >
                  <Circle className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {todos.length === 0
                      ? "No tasks yet. Add your first task above."
                      : "No tasks match your filters."}
                  </p>
                </motion.div>
              ) : (
                filtered.map(todo => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

        </div>

      </div>
    </DashboardLayout>
  );
}
