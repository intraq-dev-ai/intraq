<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { learnSections } from './learn-content';
import './learn.css';

const activeSection = ref('overview');
const mainRef = ref<HTMLElement | null>(null);
let removeScrollListener: (() => void) | null = null;

onMounted(() => {
  const container = scrollContainer();
  if (!container) return;

  const handleScroll = (): void => {
    const sectionElements = Array.from(container.querySelectorAll<HTMLElement>('section[id]'));
    const containerTop = container.getBoundingClientRect().top;
    const current = sectionElements.find(section => {
      const rect = section.getBoundingClientRect();
      const top = rect.top - containerTop;
      const bottom = rect.bottom - containerTop;
      return top <= 110 && bottom >= 110;
    });
    activeSection.value = current?.id ?? 'overview';
  };

  container.addEventListener('scroll', handleScroll);
  handleScroll();
  removeScrollListener = () => container.removeEventListener('scroll', handleScroll);
});

onUnmounted(() => {
  removeScrollListener?.();
});

function scrollToSection(sectionId: string): void {
  activeSection.value = sectionId;
  const element = document.getElementById(sectionId);
  const container = scrollContainer();
  if (!element || !container) return;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const top = elementRect.top - containerRect.top + container.scrollTop - 20;
  container.scrollTo({ top, behavior: 'smooth' });
}

function scrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.home-main') ?? mainRef.value;
}
</script>

<template>
  <section class="learn-docs" aria-labelledby="learn-title">
    <h1 id="learn-title" class="sr-only">Learn</h1>
    <aside class="learn-sidebar" aria-labelledby="learn-navigation-title">
      <h2 id="learn-navigation-title">Documentation</h2>
      <nav aria-label="Documentation sections">
        <a
          v-for="section in learnSections"
          :key="section.id"
          :href="`#${section.id}`"
          :aria-current="activeSection === section.id ? 'location' : undefined"
          @click.prevent="scrollToSection(section.id)"
        >
          <span class="learn-nav-icon" aria-hidden="true"></span>
          {{ section.title }}
        </a>
      </nav>
    </aside>

    <main ref="mainRef" class="learn-main" tabindex="-1">
      <div class="learn-content">
        <section
          v-for="section in learnSections"
          :id="section.id"
          :key="section.id"
          class="learn-section"
          :aria-labelledby="`${section.id}-title`"
        >
          <header class="learn-section-header">
            <h1 v-if="section.id === 'overview'" :id="`${section.id}-title`">{{ section.title }}</h1>
            <h2 v-else :id="`${section.id}-title`">{{ section.title }}</h2>
            <p>{{ section.summary }}</p>
          </header>

          <div class="learn-card-grid" :class="{ 'learn-card-grid--stats': section.id === 'overview' }">
            <article v-for="card in section.cards" :key="card.title" class="learn-doc-card">
              <h3>{{ card.title }}</h3>
              <p v-if="card.body">{{ card.body }}</p>
              <ul v-if="card.items?.length">
                <li v-for="item in card.items" :key="item">{{ item }}</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </main>
  </section>
</template>
