// Invitation tokens are carried in the URL fragment so they are not sent in
// initial HTTP requests or reverse-proxy access logs.
export function invitationToken(): string | null {
  const fragment = location.hash.match(/^#join\?(.*)$/)?.[1];
  if (fragment) return new URLSearchParams(fragment).get("token");
  // Accept the earlier path format when opening an existing invitation.
  return location.pathname.endsWith("/join")
    ? new URLSearchParams(location.search).get("token")
    : null;
}
