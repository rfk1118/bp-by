import { runBot } from './bot';

runBot().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
