export type HostingPlan = {
  id: string;
  name: string;
  ram: string;
  storageGb: number;
  cpu: string;
  price: number;
  description: string;
};

export const hostingPlans: HostingPlan[] = [
  { id: "starter-512", name: "Starter", ram: "512 MB", storageGb: 10, cpu: "1", price: 5, description: "Para pruebas y servidores pequeños." },
  { id: "basic-1gb", name: "Basic", ram: "1 GB", storageGb: 25, cpu: "2", price: 6.99, description: "Un mundo con pocos jugadores." },
  { id: "survival-2gb", name: "Survival", ram: "2 GB", storageGb: 50, cpu: "2", price: 11.99, description: "La opción equilibrada para jugar con amigos." },
  { id: "community-4gb", name: "Community", ram: "4 GB", storageGb: 100, cpu: "4", price: 19.99, description: "Más jugadores, plugins y mundos." },
  { id: "network-8gb", name: "Network", ram: "8 GB", storageGb: 200, cpu: "6", price: 34.99, description: "Para redes con proxy y varios servidores." },
];

export function getPlan(id: string) {
  return hostingPlans.find((plan) => plan.id === id);
}
