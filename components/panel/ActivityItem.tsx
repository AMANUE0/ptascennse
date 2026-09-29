"use client";

import type { LucideIcon } from "lucide-react";

export default function ActivityItem({
  icon: Icon,
  color,
  title,
  description,
  time,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="activity-item">
      <div className={`activity-icon ${color}`}>
        <Icon size={16} />
      </div>
      <div className="activity-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}
