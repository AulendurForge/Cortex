/** Bucket size for the traffic chart: enough points to read, never more than ~180. */
export function bucketFor(hours: number): 'minute' | 'hour' | 'day' {
  if (hours <= 6) return 'minute';
  if (hours <= 48) return 'hour';
  return 'day';
}
