import { useEffect, useState, type FormEvent } from "react";
import { coupleNames } from "../../shared/wedding";
import { FloralDivider } from "../components/Botanical";
import { Spinner } from "../components/Spinner";
import { api, ApiClientError, errorMessage } from "../lib/api";
import { Dashboard } from "./admin/Dashboard";

type State = { name: "checking" } | { name: "signed-out"; notice?: string } | { name: "signed-in"; username: string } | { name: "error" };

async function fetchSession(): Promise<State> {
  try {
    const { username } = await api<{ username: string }>("/api/admin/session");
    return { name: "signed-in", username };
  } catch (error) {
    return error instanceof ApiClientError && error.status === 401 ? { name: "signed-out" } : { name: "error" };
  }
}

/**
 * The admin UI is only a convenience: every /api/admin/* endpoint checks the
 * session on the server, so loading this page grants nothing on its own.
 */
export default function AdminPage() {
  const [state, setState] = useState<State>({ name: "checking" });

  function check() {
    setState({ name: "checking" });
    void fetchSession().then(setState);
  }

  useEffect(() => {
    document.title = `Admin · ${coupleNames()}`;
    void fetchSession().then(setState);
  }, []);

  if (state.name === "checking") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (state.name === "error") {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p role="alert" className="text-muted">
            {errorMessage(new ApiClientError(0, "network"))}
          </p>
          <button type="button" className="btn-primary mt-6" onClick={check}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (state.name === "signed-out") {
    return <LoginForm notice={state.notice} onSignedIn={(username) => setState({ name: "signed-in", username })} />;
  }
  return (
    <Dashboard
      username={state.username}
      onSignedOut={(notice) => setState({ name: "signed-out", notice })}
    />
  );
}

function LoginForm({ notice, onSignedIn }: { notice?: string; onSignedIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ username: string }>("/api/admin/login", { method: "POST", body: { username, password } });
      onSignedIn(result.username);
    } catch (err) {
      setPassword("");
      setError(
        err instanceof ApiClientError && err.code === "invalid_credentials"
          ? "Incorrect username or password."
          : err instanceof ApiClientError && err.code === "rate_limited"
            ? "Too many sign-in attempts. Please wait 15 minutes and try again."
            : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="eyebrow">Private</p>
          <h1 className="mt-3 font-serif text-4xl font-light">Wedding admin</h1>
          <FloralDivider className="mt-5" />
        </div>
        <form onSubmit={submit} noValidate className="card mt-10 space-y-5 p-6 sm:p-8">
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="username" className="field-label">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="field-input"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner small label="Signing in…" /> : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
