"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, ArrowLeft } from "lucide-react";
import ActivityItem from "./ActivityItem";

export default function PaymentActivity() {
  const [orders, setOrders] = useState<
    {
      id: string;
      plan_name: string;
      payment_status: string;
      provisioning_status: string;
      created_at: string;
    }[]
  >([]);

  useEffect(() => {
    void fetch("/api/orders")
      .then((response) => response.json())
      .then((data: { orders?: typeof orders }) => setOrders(data.orders || []))
      .catch(() => undefined);
  }, []);

  const latest = orders[0];

  return (
    <section className="activity-panel">
      <div className="section-heading compact">
        <div>
          <h2>Última transacción</h2>
          <p>Actividad reciente de pagos</p>
        </div>
        <a className="text-button" href="/planes/resultado?status=pending">
          Ver pedidos <ArrowLeft size={15} className="rotate-180" />
        </a>
      </div>

      <div className="activity-list">
        {latest ? (
          <ActivityItem
            icon={latest.payment_status === "paid" ? Check : RefreshCw}
            color={latest.payment_status === "paid" ? "green" : "orange"}
            title={`${latest.plan_name} · ${latest.payment_status}`}
            description={`Provisionamiento: ${latest.provisioning_status}`}
            time={new Date(latest.created_at).toLocaleString()}
          />
        ) : (
          <div className="empty-state">Todavía no hay transacciones.</div>
        )}
      </div>
    </section>
  );
}
