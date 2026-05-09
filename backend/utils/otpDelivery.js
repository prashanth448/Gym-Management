const { maskDestination } = require("./otp");

function isProductionEnv() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

async function sendEmailOtp(destination, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  const rawFromEmail = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !rawFromEmail) {
    return null;
  }

  const fromEmail = rawFromEmail.includes("<")
    ? rawFromEmail
    : `FitLedger <${rawFromEmail}>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "fitLedger-password-reset"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [destination],
      subject: "fitLedger password reset OTP",
      text: `Your fitLedger password reset OTP is ${otp}. It expires in 10 minutes.`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email OTP delivery failed: ${details}`);
  }

  return { provider: "resend" };
}

async function sendPhoneOtp(destination, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: destination,
        From: fromNumber,
        Body: `Your fitLedger password reset OTP is ${otp}. It expires in 10 minutes.`
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`SMS OTP delivery failed: ${details}`);
  }

  return { provider: "twilio" };
}

function buildConsoleOtpResult(channel, destination, otp) {
  console.log(`[OTP:${channel}] Password reset OTP for ${destination}: ${otp}`);

  return {
    provider: "console",
    maskedDestination: maskDestination(channel, destination),
    debugOtp: otp
  };
}

async function deliverOtp({ channel, destination, otp }) {
  let providerResult = null;

  try {
    providerResult =
      channel === "email"
        ? await sendEmailOtp(destination, otp)
        : await sendPhoneOtp(destination, otp);
  } catch (error) {
    if (isProductionEnv()) {
      throw error;
    }

    console.warn(
      `[OTP:${channel}] Provider delivery failed for ${destination}. Falling back to console OTP in non-production. ${error.message}`
    );

    return buildConsoleOtpResult(channel, destination, otp);
  }

  if (providerResult) {
    return {
      provider: providerResult.provider,
      maskedDestination: maskDestination(channel, destination)
    };
  }

  if (isProductionEnv()) {
    throw new Error(
      `No ${channel.toUpperCase()} OTP provider is configured for production delivery.`
    );
  }

  return buildConsoleOtpResult(channel, destination, otp);
}

module.exports = {
  deliverOtp
};
