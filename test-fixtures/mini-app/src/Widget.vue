<!-- Fixture SFC with planted vuejs-accessibility violations for the bundled static scanner. -->
<template>
  <section>
    <h2>Widget</h2>
    <img src="/badge.png" />
    <div @click="open">Show details</div>
  </section>
</template>

<script>
export default {
  name: 'FixtureWidget',
  methods: {
    open() {},
  },
}
</script>
