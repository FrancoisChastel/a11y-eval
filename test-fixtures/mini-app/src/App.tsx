// Fixture component with planted jsx-a11y violations for the static scanner.
export const App = () => (
  <main>
    <h1>Mini app</h1>
    <img src="/hero.png" />
    <div onClick={() => console.log('clicked')}>Open settings</div>
    <a>Broken link</a>
    <input type="text" placeholder="Search" autoFocus />
  </main>
)
