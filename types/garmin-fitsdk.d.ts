declare module "@garmin/fitsdk" {
  export class Encoder {
    writeMesg(mesg: Record<string, unknown>): void;
    close(): Uint8Array;
  }

  export const Profile: {
    MesgNum: Record<string, number>;
    messages: Record<number, { fields: Record<number, { num: number; name: string; type: string }> }>;
    types: Record<string, Record<string, string>>;
  };
}
