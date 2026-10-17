import ClientApp from '@/client/ClientApp'

/** Every non-API URL renders the client-side app, which routes with react-router (the old SPA fallback rewrite). */
export default function Page() {
  return <ClientApp />
}
