export const CHECKOUT_DRAFT_KEY = "craftpanel.checkout.draft";

export type CheckoutDraft<T> = {
  planId: string;
  form: T;
};

export function saveCheckoutDraft<T>(draft: CheckoutDraft<T>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
}

export function readCheckoutDraft<T>(): CheckoutDraft<T> | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as CheckoutDraft<T>;
    return typeof draft.planId === "string" && draft.form ? draft : null;
  } catch {
    window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    return null;
  }
}

export function clearCheckoutDraft() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
}