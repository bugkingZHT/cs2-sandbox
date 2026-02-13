import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { initAuth } from './composables/useAuth';
import './styles.css';
import './styles/toast.css';

async function bootstrap() {
  await initAuth();
  const app = createApp(App);
  app.use(ElementPlus);
  app.mount('#app');
}
bootstrap();
