<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import './public-access.css';

const route = useRoute();

const detail = computed(() => {
  const reason = typeof route.query.reason === 'string' ? route.query.reason : '';
  if (reason === 'login-route') return 'Login routes cannot be rendered inside an embedded dashboard frame.';
  if (reason === 'authenticated-route') return 'This dashboard URL requires an intraQ app session.';
  return 'The embedded dashboard route could not be loaded.';
});
</script>

<template>
  <main class="public-access-page embed-page" aria-labelledby="embed-error-title">
    <section class="embed-shell">
      <section class="public-access-error embed-route-error" role="alert" aria-labelledby="embed-error-title">
        <h1 id="embed-error-title">Dashboard Embed Unavailable</h1>
        <p>{{ detail }}</p>
        <p>Use a signed embed URL generated for the customer portal.</p>
      </section>
    </section>
  </main>
</template>
