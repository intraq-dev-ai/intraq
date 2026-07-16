<script setup lang="ts">
const elementName = defineModel<string>('elementName', { required: true });
const elementType = defineModel<string>('elementType', { required: true });
const elementChartType = defineModel<string>('elementChartType', { required: true });
</script>

<template>
  <label for="element-name">Element name</label>
  <input id="element-name" v-model="elementName">
  <label for="element-type">Element type</label>
  <select id="element-type" v-model="elementType">
    <option value="chart">Chart</option>
    <option value="table">Table</option>
    <option value="card">Card</option>
    <option value="matrix">Matrix</option>
    <option value="filter">Filter</option>
  </select>
  <label for="element-chart-type">Chart type</label>
  <select id="element-chart-type" v-model="elementChartType" :disabled="elementType !== 'chart'">
    <option value="line">Line</option>
    <option value="bar">Bar</option>
    <option value="column">Column</option>
    <option value="stacked">Stacked bar</option>
    <option value="area">Area</option>
    <option value="pie">Pie</option>
    <option value="doughnut">Doughnut</option>
  </select>
</template>
