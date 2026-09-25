import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

// "Record attachment" in WebAuthor emails: the record as a PDF (e.g. the TV Installation
// and Condition Form with the customer's signature, SPEC §5.2 trigger 713).

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  brand: { fontSize: 9, color: "#6b7280", marginBottom: 4 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 9, color: "#6b7280", marginBottom: 14 },
  heading: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151", marginTop: 10, marginBottom: 4, textTransform: "uppercase" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
  label: { width: "35%", color: "#6b7280" },
  value: { width: "65%" },
  images: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  image: { width: 160, height: 120, objectFit: "cover", borderRadius: 4 },
  signature: { width: 220, height: 90, objectFit: "contain", borderWidth: 0.5, borderColor: "#d1d5db" },
});

export type PdfImage = { label: string; data: Buffer; signature?: boolean };

export async function recordPdf(input: {
  tableLabel: string;
  title: string;
  generatedAt: string;
  fields: { label: string; value: string; heading?: string }[];
  images: PdfImage[];
}): Promise<Buffer> {
  const byLabel = new Map<string, PdfImage[]>();
  for (const img of input.images) byLabel.set(img.label, [...(byLabel.get(img.label) ?? []), img]);

  const doc = (
    <Document title={input.title}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.brand}>TechSquad · {input.tableLabel}</Text>
        <Text style={s.title}>{input.title}</Text>
        <Text style={s.sub}>Generated {input.generatedAt}</Text>
        {input.fields.map((f, i) => (
          <View key={i} wrap={false}>
            {f.heading && <Text style={s.heading}>{f.heading}</Text>}
            <View style={s.row}>
              <Text style={s.label}>{f.label}</Text>
              <Text style={s.value}>{f.value}</Text>
            </View>
          </View>
        ))}
        {[...byLabel.entries()].map(([label, imgs]) => (
          <View key={label} wrap={false}>
            <Text style={s.heading}>{label}</Text>
            <View style={s.images}>
              {imgs.map((img, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                <Image key={i} src={img.data} style={img.signature ? s.signature : s.image} />
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
