export const SEATS = ['T1A', 'T1B', 'T2A', 'T2B'] as const;
export type SeatId = (typeof SEATS)[number];

export type TeamId = 'T1' | 'T2';

export function teamFromSeat(seat: SeatId): TeamId {
  return seat.startsWith('T1') ? 'T1' : 'T2';
}

export function nextFreeSeat(occupied: Set<SeatId>): SeatId | null {
  for (const seat of SEATS) {
    if (!occupied.has(seat)) return seat;
  }
  return null;
}
