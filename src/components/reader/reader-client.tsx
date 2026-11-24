"use client";

import dynamic from "next/dynamic";

// The reader depends on IndexedDB, localStorage and epub.js — browser only.
export const ReaderClient = dynamic(() => import("./reader").then((m) => m.Reader), { ssr: false });
