/**
 * `qrcode` 는 타입 선언을 함께 주지 않고, @types/qrcode 는 공개 API(toString/toDataURL)만
 * 다룬다. 우리는 fs 를 끌어오지 않는 **core 만** 직접 쓰므로(§src/features/qr/svg.ts)
 * 필요한 만큼만 여기서 선언한다.
 */
declare module 'qrcode/lib/core/qrcode' {
  export interface QrBitMatrix {
    size: number;
    /** row-major, 1 = 어두운 모듈 */
    data: Uint8Array;
  }
  export interface QrCode {
    modules: QrBitMatrix;
    version: number;
  }
  export function create(
    data: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; version?: number },
  ): QrCode;
  const _default: { create: typeof create };
  export default _default;
}
