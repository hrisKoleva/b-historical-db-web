import 'dotenv/config';
import createApp from './app';
import { getAppConfig, getPort } from './config/env';

const port = getPort();
const app = createApp(getAppConfig());

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Historical DB API listening on port ${port}`);
});

