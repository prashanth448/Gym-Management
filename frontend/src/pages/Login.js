import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API, { getApiError } from "../services/api";
import { getDefaultRouteForRole, setSession } from "../services/auth";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from;
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
        identifier: recoveryForm.identifier
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
        identifier: recoveryForm.identifier,
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
        <h1>fitLedger</h1>
      </section>

      <section className="auth-card">
        <div>
          <h2>{mode === "login" ? "Sign in" : "Reset password"}</h2>
          {mode === "forgot" ? (
            <p className="muted-copy">Enter your registered mobile number to get an OTP.</p>
          ) : null}
        </div>

        {message ? <div className="status-banner">{message}</div> : null}
        {error ? <div className="status-banner status-banner--error">{error}</div> : null}
        {debugOtp ? (
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
              <input
                type="password"
                placeholder="Enter your password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
              />
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
              <span>Registered mobile number</span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
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
                  <input
                    type="password"
                    placeholder="Enter a new password"
                    value={recoveryForm.newPassword}
                    onChange={(event) =>
                      updateRecoveryField("newPassword", event.target.value)
                    }
                  />
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
