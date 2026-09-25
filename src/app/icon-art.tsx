// Shared artwork for generated app icons (favicon, Apple touch icon, PWA icons).
export function IconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111827",
        color: "#ffffff",
        fontSize: size * 0.42,
        fontWeight: 700,
        letterSpacing: -size * 0.02,
      }}
    >
      TS
    </div>
  );
}
