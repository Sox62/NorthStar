import { Spectral, Hanken_Grotesk } from "next/font/google";

/** Redesign fonts. Load once and put `${northstarFonts}` on <body> (or a wrapper).
 *  Optional — omit and the components fall back to your existing stack. */
export const spectral = Spectral({ subsets: ["latin"], weight: ["300", "400", "500", "600"], style: ["normal", "italic"], variable: "--ns-serif-font" });
export const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--ns-sans-font" });
export const northstarFonts = `${spectral.variable} ${hanken.variable}`;
