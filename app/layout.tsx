import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voto Sob Custódia — informação, território e voto",
  description: "Entenda o direito ao voto e acompanhe a construção de uma base verificável de seções eleitorais em presídios e unidades socioeducativas.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
