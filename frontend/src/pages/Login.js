import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API, { getApiError } from "../services/api";
import { getDefaultRouteForRole, setSession } from "../services/auth";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function PasswordVisibilityIcon({ visible }) {
  return (
    <svg
      aria-hidden="true"
      className="field-toggle__icon"
      viewBox="0 0 24 24"
      focusable="false"
    >
      <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
      {!visible ? <path className="field-toggle__slash" d="M4 20 20 4" /> : null}
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from;
  const logoUrl = `${process.env.PUBLIC_URL || ""}/icons/icon-192.png`;
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
      <div className="auth-equipment-scene" aria-hidden="true">
        <span className="equipment equipment--barbell equipment--one" />
        <span className="equipment equipment--plate equipment--two" />
        <span className="equipment equipment--kettlebell equipment--three" />
        <span className="equipment equipment--dumbbell equipment--four" />
        <span className="equipment equipment--barbell equipment--five" />
        <span className="equipment equipment--plate equipment--six" />
      </div>

      <section className="auth-hero">
        <div className="auth-hero-copy">
          <span className="eyebrow">Gym operations</span>
          <div className="auth-brand">
            <img src={logoUrl} alt="" />
            <h1>fitLedger</h1>
          </div>
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
                  className="field-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <PasswordVisibilityIcon visible={showPassword} />
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
                      className="field-toggle"
                      type="button"
                      aria-label={
                        showRecoveryPassword ? "Hide new password" : "Show new password"
                      }
                      title={showRecoveryPassword ? "Hide new password" : "Show new password"}
                      onClick={() => setShowRecoveryPassword((current) => !current)}
                    >
                      <PasswordVisibilityIcon visible={showRecoveryPassword} />
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
