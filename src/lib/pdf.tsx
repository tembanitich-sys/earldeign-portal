import "server-only";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { JvRow } from "./access";
import { fmtDate, fmtDateTime } from "./dates";
import { formatMinor } from "./money";

const fontDir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
let fontsReady = false;
function fonts() {
  if (fontsReady) return;
  if (fs.existsSync(path.join(fontDir, "inter-latin-400-normal.woff"))) {
    Font.register({
      family: "Inter",
      fonts: [
        { src: path.join(fontDir, "inter-latin-400-normal.woff"), fontWeight: 400 },
        { src: path.join(fontDir, "inter-latin-600-normal.woff"), fontWeight: 600 },
        { src: path.join(fontDir, "inter-latin-700-normal.woff"), fontWeight: 700 },
      ],
    });
  }
  Font.registerHyphenationCallback((w) => [w]);
  fontsReady = true;
}

const INK = "#111827", SLATE = "#6B7280", BORDER = "#E5E7EB", GOLD = "#C49A1A";

const st = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: INK, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, lineHeight: 1.45 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  company: { fontSize: 13, fontWeight: 700 },
  small: { fontSize: 8.5, color: SLATE },
  rule: { height: 1.5, backgroundColor: GOLD, width: 40, marginVertical: 10 },
  title: { fontSize: 18, fontWeight: 700, lineHeight: 1.25, marginBottom: 4 },
  h3: { fontSize: 10.5, fontWeight: 600, marginTop: 14, marginBottom: 6 },
  facts: { flexDirection: "row", flexWrap: "wrap" },
  fact: { width: "50%", marginBottom: 6, paddingRight: 8 },
  factK: { fontSize: 8, color: SLATE },
  table: { borderTopWidth: 1, borderTopColor: BORDER },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 5 },
  th: { fontSize: 8, color: SLATE, fontWeight: 600 },
  num: { textAlign: "right", fontFamily: "Inter" },
  total: { flexDirection: "row", borderTopWidth: 1, borderTopColor: INK, paddingVertical: 5, fontWeight: 600 },
  sigRow: { flexDirection: "row", marginTop: 8 },
  sig: { flex: 1, marginRight: 10, borderTopWidth: 1, borderTopColor: INK, paddingTop: 4, marginTop: 28 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: SLATE },
  qr: { width: 64, height: 64 },
  box: { borderWidth: 1, borderColor: BORDER, padding: 8, marginTop: 6 },
});

export type Col = { label: string; width: string; num?: boolean };

export function Table({ cols, rows, totals }: { cols: Col[]; rows: (string | ReactNode)[][]; totals?: (string | null)[][] }) {
  return (
    <View style={st.table}>
      <View style={st.tr} fixed>{cols.map((c, i) => <Text key={i} style={[st.th, { width: c.width }, c.num ? st.num : {}]}>{c.label}</Text>)}</View>
      {rows.map((r, i) => (
        <View key={i} style={st.tr} wrap={false}>{r.map((cell, j) => <Text key={j} style={[{ width: cols[j].width, paddingRight: 4 }, cols[j].num ? st.num : {}]}>{cell as string}</Text>)}</View>
      ))}
      {totals?.map((t, i) => (
        <View key={`t${i}`} style={st.total}>{t.map((cell, j) => <Text key={j} style={[{ width: cols[j].width }, cols[j].num ? st.num : {}]}>{cell ?? ""}</Text>)}</View>
      ))}
    </View>
  );
}

export function Facts({ items }: { items: [string, string | null | undefined][] }) {
  return <View style={st.facts}>{items.map(([k, v]) => <View key={k} style={st.fact}><Text style={st.factK}>{k}</Text><Text>{v || "–"}</Text></View>)}</View>;
}

export function Signatures({ labels }: { labels: string[] }) {
  return (
    <View style={st.sigRow} wrap={false}>
      {labels.map((l) => <View key={l} style={st.sig}><Text style={st.small}>{l}</Text><Text style={[st.small, { marginTop: 10 }]}>Name / date</Text></View>)}
    </View>
  );
}

export const H3 = ({ children }: { children: ReactNode }) => <Text style={st.h3}>{children}</Text>;
export const P = ({ children, small }: { children: ReactNode; small?: boolean }) => <Text style={small ? st.small : undefined}>{children}</Text>;
export const Box = ({ children }: { children: ReactNode }) => <View style={st.box}>{children}</View>;
export const m = (minor: number | null | undefined) => (minor === null || minor === undefined ? "–" : formatMinor(minor));

/** Letterhead of the JV's front-facing company, document title, QR code linking to the record. */
export async function renderDoc(opts: { jv: JvRow; title: string; number: string; subtitle?: string; verifyUrl: string; children: ReactNode; landscape?: boolean }) {
  fonts();
  const qr = await QRCode.toDataURL(opts.verifyUrl, { margin: 0, width: 160 });
  const j = opts.jv;
  let logo: { data: Buffer; format: "png" | "jpg" } | null = null;
  if (j.logoKey && j.logoMime) {
    const { storage } = await import("./storage");
    const data = await storage().get(j.logoKey);
    if (data) logo = { data, format: j.logoMime === "image/png" ? "png" : "jpg" };
  }
  const tax = [j.vatNo && `VAT ${j.vatNo}`, j.bpNo && `BP ${j.bpNo}`, j.tin && `TIN ${j.tin}`].filter(Boolean).join(" · ");
  const doc = (
    <Document title={`${opts.title} ${opts.number}`} author={j.companyName} creator="Earldeign Portal">
      <Page size="A4" orientation={opts.landscape ? "landscape" : "portrait"} style={st.page}>
        <View style={st.head}>
          <View style={{ maxWidth: "70%" }}>
            {logo ? <Image src={logo} style={{ maxHeight: 44, maxWidth: 200, objectFit: "contain", marginBottom: 6 }} /> : null}
            <Text style={st.company}>{j.companyName}</Text>
            {j.companyAddress ? <Text style={st.small}>{j.companyAddress}</Text> : null}
            <Text style={st.small}>{[j.companyPhone, j.companyEmail].filter(Boolean).join(" · ")}</Text>
            {tax ? <Text style={st.small}>{tax}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Image style={st.qr} src={qr} />
            <Text style={[st.small, { marginTop: 2 }]}>Scan to verify in the portal</Text>
          </View>
        </View>
        <View style={st.rule} />
        <Text style={st.title}>{opts.title}</Text>
        <Text style={{ fontWeight: 600, marginBottom: 12, lineHeight: 1.3 }}>{opts.number}{opts.subtitle ? `  ·  ${opts.subtitle}` : ""}</Text>
        {opts.children}
        <View style={st.footer} fixed>
          <Text>{j.name} · Generated {fmtDateTime(new Date())} by Earldeign Portal. The portal record is the source of truth.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export { fmtDate };
