"use client";

/**
 * Shared WebAuthn / passkey helpers for live-app biometrics
 * (Windows Hello, Touch ID, Face ID, Android biometrics / fingerprint).
 */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { iamApi } from "@/lib/api";

export function biometricBlockReason(): string | null {
  if (typeof window === "undefined") return "ssr";
  try {
    if (!window.isSecureContext) {
      const host = window.location.hostname;
      const isLoopback = host === "localhost" || host === "127.0.0.1";
      if (!isLoopback) {
        // Don't surface long HTTPS/IP copy on login/signup UI.
        // return `Biometrics need HTTPS. This page is ${window.location.origin} (HTTP / IP is blocked by the browser). Open via https://your-domain or http://localhost:3000.`;
        return "Biometrics unavailable on this connection";
      }
      return "Biometrics need a secure context on this browser";
    }
    if (!browserSupportsWebAuthn()) {
      return "This browser does not support passkeys / Windows Hello / Touch ID";
    }
    return null;
  } catch {
    return "Biometrics unavailable in this browser";
  }
}

export function canUseBiometrics(): boolean {
  return biometricBlockReason() === null;
}

function clientOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function mapWebAuthnError(e: unknown): Error {
  if (e instanceof Error) {
    const name = "name" in e ? String((e as { name?: string }).name) : "";
    const msg = e.message || "";
    if (name === "NotAllowedError" || /not allowed|timed out|cancel/i.test(msg)) {
      return new Error("Biometric prompt was cancelled or timed out");
    }
    if (name === "InvalidStateError") {
      return new Error(
        "This device is already registered — remove it in Settings, then register again",
      );
    }
    if (name === "SecurityError" || /secure context|rpId|origin/i.test(msg)) {
      return new Error(
        biometricBlockReason() ||
          "Biometric security error — use HTTPS (or localhost) and the same site address you registered with",
      );
    }
    return e;
  }
  return new Error("Biometric request failed");
}

export async function registerDeviceBiometric(label = "This device") {
  const blocked = biometricBlockReason();
  if (blocked) throw new Error(blocked);
  try {
    const options = await iamApi.webauthnRegisterOptions(clientOrigin());
    const attestation = await startRegistration({
      optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    return await iamApi.webauthnRegisterVerify({
      response: attestation,
      label,
      clientOrigin: clientOrigin(),
    });
  } catch (e) {
    throw mapWebAuthnError(e);
  }
}

export async function biometricLogin(email: string) {
  const blocked = biometricBlockReason();
  if (blocked) throw new Error(blocked);
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Enter your email first");
  try {
    const options = await iamApi.webauthnLoginOptions(
      normalized,
      clientOrigin(),
    );
    const assertion = await startAuthentication({
      optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
    });
    return await iamApi.webauthnLoginVerify(
      normalized,
      assertion,
      clientOrigin(),
    );
  } catch (e) {
    throw mapWebAuthnError(e);
  }
}

export const BIOMETRIC_LAST_EMAIL_KEY = "upos-bio-email";

export function rememberBioEmail(email: string) {
  try {
    localStorage.setItem(BIOMETRIC_LAST_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* ignore */
  }
}

export function readRememberedBioEmail(): string {
  try {
    return localStorage.getItem(BIOMETRIC_LAST_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}
