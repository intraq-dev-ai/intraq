<script setup lang="ts">
defineProps<{
  adminEmail: string;
  brandHeader: string;
  brandSubHeader: string;
  routePill: string;
  tenantName: string;
  workspaceTitle: string;
}>();
</script>

<template>
  <aside class="auth-hero" aria-label="Tenant branding">
    <div class="auth-brand-mark" aria-hidden="true">{{ brandHeader.slice(0, 2).toUpperCase() }}</div>
    <div class="auth-hero-copy">
      <p class="auth-pill">{{ routePill }}</p>
      <h1>{{ brandHeader }}</h1>
      <p v-if="brandSubHeader">{{ brandSubHeader }}</p>
    </div>
    <dl class="auth-tenant-card" aria-label="Tenant setup summary">
      <dt>Tenant</dt>
      <dd>{{ tenantName }}</dd>
      <dt>Administrator</dt>
      <dd>{{ adminEmail }}</dd>
      <dt>Workspace</dt>
      <dd>{{ workspaceTitle }}</dd>
    </dl>
  </aside>
</template>
