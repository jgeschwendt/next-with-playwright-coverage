// Kept in its own module so it can be excluded from Istanbul instrumentation.
//
// `next/font/google` calls must survive as bare `const x = Font({...})` module-scope
// assignments for Next's font transform to recognise them. The SWC coverage plugin
// runs first and rewrites them into sequence expressions (`cov_x().s[0]++, Geist(...)`),
// which trips "Font loaders must be called and assigned to a const in the module scope".
// `experimental.swcPlugins[0][1].unstableExclude` in next.config.ts skips this file.
import { Geist, Geist_Mono } from "next/font/google";

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
