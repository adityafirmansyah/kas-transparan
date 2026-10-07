/**
 * Shared frontend types mirroring backend Pydantic response/request schemas
 * (see backend/app/schemas/schemas.py). Kept intentionally lean for an MVP:
 * only the shapes the frontend actually consumes are modeled here.
 */

export type Role = "admin" | "ketua" | "warga";

export interface Komunitas {
  id: string;
  nama: string;
  slug: string;
  alamat: string | null;
}

export interface KomunitasUpdate {
  nama?: string;
  slug?: string;
  alamat?: string;
}

export interface KomunitasUser {
  id: string;
  username: string;
  role: Role;
  komunitas_id: string;
  created_at?: string;
}

export interface UserCreate {
  username: string;
  password: string;
  role: Role;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: Role;
  komunitas_id: string;
}

export interface Warga {
  id: string;
  nama: string;
  no_hp: string | null;
  alamat: string | null;
  no_rumah: string | null;
  aktif: boolean;
}

export interface WargaCreate {
  nama: string;
  no_hp?: string;
  alamat?: string;
  no_rumah?: string;
  aktif?: boolean;
}

export interface WargaUpdate {
  nama?: string;
  no_hp?: string;
  alamat?: string;
  no_rumah?: string;
  aktif?: boolean;
}

export type PeriodType = "monthly" | "one_time";

export interface IuranType {
  id: string;
  nama: string;
  nominal: number;
  period_type: PeriodType;
  aktif: boolean;
}

export interface IuranTypeCreate {
  nama: string;
  nominal: number;
  period_type: PeriodType;
}

export type PaymentMethod = "tunai" | "transfer";
export type TagihanStatus = "lunas" | "belum_bayar";

export interface Tagihan {
  id: string;
  warga_id: string;
  iuran_type_id: string;
  periode: string;
  nominal: number;
  status: TagihanStatus;
  payment_method: PaymentMethod | null;
  proof_image_path: string | null;
  paid_at: string | null;
}

/** TagihanOut enriched with joined display fields (TagihanWithWargaOut). */
export interface TagihanWithWarga extends Tagihan {
  warga_nama: string;
  iuran_nama: string;
}

export type KasEntryTipe = "pemasukan" | "pengeluaran";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface KasEntry {
  id: string;
  tipe: KasEntryTipe;
  kategori: string;
  deskripsi: string;
  nominal: number;
  tanggal: string;
  receipt_image_path: string | null;
  approval_status: ApprovalStatus | null;
  created_at: string;
}

export interface WargaSelfCheckTagihan {
  id: string;
  periode: string;
  iuran_nama: string;
  nominal: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
}

export interface WargaSelfCheckResponse {
  warga_nama: string;
  no_rumah: string | null;
  komunitas_nama: string;
  total_unpaid_count: number;
  total_unpaid_nominal: number;
  tagihan_list: WargaSelfCheckTagihan[];
}

export interface PublicSummary {
  komunitas_nama: string;
  saldo_akhir: number;
  total_masuk_bulan_ini: number;
  total_keluar_bulan_ini: number;
  pengeluaran_per_kategori: Record<string, number>;
  periode: string;
}

/** Shape returned by GET /api/kas/saldo. */
export interface SaldoResponse {
  saldo: number;
}

/** One unpaid period+iuran line item within a multi-month arrears breakdown. */
export interface TunggakanPeriode {
  tagihan_id: string;
  periode: string;
  iuran_nama: string;
  nominal: number;
}

/** Shape returned by GET /api/reports/tunggakan-multi: a warga's unpaid periods
 * aggregated across a periode range (multi-month arrears / "tunggakan"). */
export interface TunggakanMulti {
  warga_id: string;
  warga_nama: string;
  unpaid_periods: TunggakanPeriode[];
  total_unpaid_count: number;
  distinct_months_count: number;
  total_nominal: number;
}

export interface BatchPayTagihanRequest {
  tagihan_ids: string[];
  payment_method: PaymentMethod;
  proof_image_path?: string;
}

export interface BatchPayTagihanResponse {
  paid_count: number;
  total_nominal: number;
  paid_tagihan: Tagihan[];
}

export interface FuturePaymentItem {
  periode: string;
  iuran_type_id: string;
}

export interface RecordFuturePaymentRequest {
  warga_id: string;
  items: FuturePaymentItem[];
  payment_method: PaymentMethod;
  proof_image_path?: string;
}

export interface RecordFuturePaymentResponse {
  warga_id: string;
  warga_nama: string;
  total_paid_count: number;
  total_nominal: number;
  paid_tagihan: Tagihan[];
}

/** Common shape of FastAPI error responses, e.g. { "detail": "..." }. */
export interface ApiErrorDetail {
  detail?: string;
}
