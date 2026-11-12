export function userRoute(base: string, id: string): string {
  return `${base}/users/${id}`;
}

export function postsRoute(base: string): string {
  return `${base}/posts`;
}
