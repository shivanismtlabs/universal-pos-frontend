"use client";

/**
 * Shared WebAuthn / passkey helpers for live-app biometrics
 * (Windows Hello, Touch ID, Face ID, Android biometrics).
 */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { iamApi } from "@/lib/api";

export function canUseBiometrics(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

export async function registerDeviceBiometric(label = "This device") {
  if (!canUseBiometrics()) {
    throw new Error(
      "Biometrics require HTTPS (or localhost) and a supported browser",
    );
  }
  const options = await iamApi.webauthnRegisterOptions();
  const attestation = await startRegistration({
    optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return iamApi.webauthnRegisterVerify({
    response: attestation,
    label,
  });
}

export async function biometricLogin(email: string) {
  if (!canUseBiometrics()) {
    throw new Error(
      "Biometrics require HTTPS (or localhost) and a supported browser",
    );
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Enter your email first");
  const options = await iamApi.webauthnLoginOptions(normalized);
  const assertion = await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return iamApi.webauthnLoginVerify(normalized, assertion);
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
