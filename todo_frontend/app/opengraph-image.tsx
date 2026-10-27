import { ImageResponse } from 'next/og';
export const alt = 'todos — Vazifalar va kundalik rejalar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 90, background: '#f5f7ef', color: '#253c32' }}>
      <div style={{ display: 'flex', fontSize: 48, fontWeight: 700 }}>todos.</div>
      <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, marginTop: 30 }}>Kichik qadamlar,</div>
      <div style={{ display: 'flex', fontSize: 76, fontWeight: 700 }}>katta natijalar.</div>
      <div style={{ display: 'flex', fontSize: 30, marginTop: 32 }}>Vazifalar · Kundalik rejalar · Eslatmalar</div>
    </div>, size,
  );
}
