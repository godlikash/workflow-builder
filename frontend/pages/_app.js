import { NhostNextProvider } from '@nhost/nextjs';
import { NhostApolloProvider } from '@nhost/react-apollo';
import { nhost } from '../lib/nhost';
import { OrgProvider } from '../context/OrgContext';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <NhostNextProvider nhost={nhost} initial={pageProps.nhostSession}>
      <NhostApolloProvider nhost={nhost}>
        <OrgProvider>
          <Component {...pageProps} />
        </OrgProvider>
      </NhostApolloProvider>
    </NhostNextProvider>
  );
}
