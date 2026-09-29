import { NextResponse } from "next/server";
import { getPaymentConfig } from "@/lib/payments";

export function GET() {
  const config = getPaymentConfig();
  return NextResponse.json({ mode: config.mode, label: config.label, enabled: config.enabled });
}