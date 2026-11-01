import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const sans = Manrope({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "ExpenseWise",
  description: "Finanțe personale și de familie.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0F19",
  colorScheme: "dark",
};

const themeBoot = `(function(){try{localStorage.removeItem("ew-theme");}catch(e){}document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark";})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" data-theme="dark" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={sans.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
