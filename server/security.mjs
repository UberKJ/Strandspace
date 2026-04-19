const LOCALHOST_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLocalhostAddress(address = "") {
  const normalized = String(address ?? "").trim();
  return LOCALHOST_ADDRESSES.has(normalized);
}

export function isLocalhostRequest(req) {
  const remoteAddress = String(req.socket?.remoteAddress ?? "").trim();
  return isLocalhostAddress(remoteAddress);
}

export function isRemoteAccessAllowed() {
  return String(process.env.STRANDSPACE_ALLOW_REMOTE ?? "").trim().toLowerCase() === "true";
}

export function assertLocalhostRequest(req) {
  if (isRemoteAccessAllowed()) {
    return;
  }

  if (!isLocalhostRequest(req)) {
    const error = new Error("Remote access is disabled by default. Set STRANDSPACE_ALLOW_REMOTE=true to enable it.");
    error.statusCode = 403;
    error.payload = {
      ok: false,
      code: "REMOTE_ACCESS_DISABLED",
      error: "Remote access is disabled by default. Enable STRANDSPACE_ALLOW_REMOTE only when you understand the security implications."
    };
    throw error;
  }
}

export function getThreatModel() {
  return {
    name: "Strandspace Local-First Threat Model",
    summary: "Strandspace is designed to be a local-first tool with the server bound to localhost by default. Remote API access is disabled unless explicitly enabled by the user.",
    threats: [
      {
        id: "remote-api-exposure",
        description: "An attacker on the same network uses an exposed server port to query or modify the local recall database.",
        mitigation: "API access is restricted to localhost unless STRANDSPACE_ALLOW_REMOTE=true is set."
      },
      {
        id: "injection-through-api-input",
        description: "Malicious JSON or URL input could be used to manipulate database operations or routing.",
        mitigation: "Request payloads are validated against explicit schemas and unsafe paths are normalized before use."
      },
      {
        id: "openai-key-exfiltration",
        description: "A compromised browser load or remote request could leak the OpenAI API key if not protected.",
        mitigation: "OpenAI keys are only read from local environment variables and are never returned in API responses."
      }
    ]
  };
}
