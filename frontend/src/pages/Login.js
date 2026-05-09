import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API, { getApiError } from "../services/api";
import { getDefaultRouteForRole, setSession } from "../services/auth";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

const APP_FACTS = [
  {
    title: "Real-time floor pulse",
    description:
      "Attendance, payments, and customer updates stay in sync so the front desk always sees the latest activity."
  },
  {
    title: "Built for daily gym ops",
    description:
      "FitLedger keeps member records, renewals, and collections in one workflow instead of scattered notebooks and chats."
  },
  {
    title: "Owner and admin ready",
    description:
      "The app supports role-based access, so each gym can manage its own members while admin users oversee the bigger picture."
  }
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from;
  const expiredMessage =
    location.state?.reason === "expired" ? "Your session expired. Please sign in again." : "";
  const [form, setForm] = useState({ email: "", password: "" });
  const [recoveryForm, setRecoveryForm] = useState({
    identifier: "",
    otp: "",
    newPassword: ""
  });
  const [mode, setMode] = useState("login");
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [debugOtp, setDebugOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateRecoveryField = (key, value) => {
    setRecoveryForm((current) => ({ ...current, [key]: value }));
  };

  const resetRecoveryState = () => {
    setOtpRequested(false);
    setRecoveryForm({
      identifier: "",
      otp: "",
      newPassword: ""
    });
    setDebugOtp("");
    setError("");
    setMessage("");
  };

  const completeLogin = (response) => {
    setSession(response.data.token, response.data.user);
    navigate(redirectTo || getDefaultRouteForRole(response.data.user?.role), {
      replace: true
    });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const credentials = {
      email: normalizeEmail(form.email),
      password: form.password
    };

    try {
      const response = await API.post("/login", credentials);
      completeLogin(response);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to log in."));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setDebugOtp("");
    setRecoveryLoading(true);

    try {
      const response = await API.post("/forgot-password/request-otp", {
        identifier: normalizeEmail(recoveryForm.identifier)
      });

      setOtpRequested(true);
      setMessage(response.data.message);
      setDebugOtp(response.data.debugOtp || "");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to send OTP."));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setRecoveryLoading(true);

    try {
      const response = await API.post("/forgot-password/reset", {
        identifier: normalizeEmail(recoveryForm.identifier),
        otp: recoveryForm.otp,
        newPassword: recoveryForm.newPassword
      });

      setMessage(response.data.message);
      setMode("login");
      setOtpRequested(false);
      setDebugOtp("");
      setForm((current) => ({ ...current, password: "" }));
      setRecoveryForm((current) => ({
        ...current,
        otp: "",
        newPassword: ""
      }));
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to reset password."));
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="auth-hero-copy">
          <span className="eyebrow">Gym operations, simplified</span>
          <h1>fitLedger</h1>
          <p>
            A focused dashboard for managing members, payments, attendance, and day-to-day
            gym operations without the usual spreadsheet sprawl.
          </p>
        </div>

        <div className="auth-feature-list">
          {APP_FACTS.map((fact) => (
            <article className="auth-feature" key={fact.title}>
              <strong>{fact.title}</strong>
              <span>{fact.description}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="auth-card">
        <div>
          <h2>{mode === "login" ? "Sign in" : "Reset password"}</h2>
          {mode === "forgot" ? (
            <p className="muted-copy">Enter your registered email address to get an OTP.</p>
          ) : null}
        </div>

        {message ? <div className="status-banner">{message}</div> : null}
        {!message && expiredMessage ? <div className="status-banner">{expiredMessage}</div> : null}
        {error ? <div className="status-banner status-banner--error">{error}</div> : null}
        {process.env.NODE_ENV !== "production" && debugOtp ? (
          <div className="status-banner">
            Development OTP preview: <strong>{debugOtp}</strong>
          </div>
        ) : null}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="owner@example.com"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="field-inline">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                />
                <button
                  className="button button--ghost field-toggle"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <div className="auth-actions">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  setMode("forgot");
                  resetRecoveryState();
                }}
              >
                Forgot password
              </button>
            </div>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={otpRequested ? handleResetPassword : handleRequestOtp}
          >
            <label className="field">
              <span>Registered email address</span>
              <input
                type="email"
                inputMode="email"
                placeholder="owner@example.com"
                value={recoveryForm.identifier}
                onChange={(event) => updateRecoveryField("identifier", event.target.value)}
                disabled={otpRequested}
              />
            </label>

            {otpRequested ? (
              <>
                <label className="field">
                  <span>OTP</span>
                  <input
                    placeholder="Enter the 6-digit OTP"
                    value={recoveryForm.otp}
                    onChange={(event) => updateRecoveryField("otp", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>New password</span>
                  <div className="field-inline">
                    <input
                      type={showRecoveryPassword ? "text" : "password"}
                      placeholder="Enter a new password"
                      value={recoveryForm.newPassword}
                      onChange={(event) =>
                        updateRecoveryField("newPassword", event.target.value)
                      }
                    />
                    <button
                      className="button button--ghost field-toggle"
                      type="button"
                      onClick={() => setShowRecoveryPassword((current) => !current)}
                    >
                      {showRecoveryPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
              </>
            ) : null}

            <div className="auth-actions">
              <button className="button" type="submit" disabled={recoveryLoading}>
                {recoveryLoading
                  ? otpRequested
                    ? "Resetting..."
                    : "Sending OTP..."
                  : otpRequested
                    ? "Reset password"
                    : "Send OTP"}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  setMode("login");
                  resetRecoveryState();
                }}
              >
                Back to login
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
