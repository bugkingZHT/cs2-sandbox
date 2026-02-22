import { createApp } from 'vue';
import App from './App.vue';
import { initAuth } from './composables/useAuth';
import './styles.css';
import './styles/toast.css';

async function bootstrap() {
  await initAuth();
  const app = createApp(App);
  app.mount('#app');
}
bootstrap();
