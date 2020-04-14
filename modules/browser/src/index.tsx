import React from 'react';
import ReactDOM from 'react-dom';
import {
  ThemeProvider,
  createTheme,
  Arwes,
  Button,
  Heading
} from 'arwes';
import WebFont from 'webfontloader';
import {getRoom} from './client';

WebFont.load({
  custom: {
    families: ['Electrolize', 'Titillium Web'],
  },
});
const App = () => (
  <ThemeProvider
    theme={createTheme({
      typography: {
        headerFontFamily: '"Electrolize"',
        fontFamily: '"Titillium Web"',
      },
    })}
  >
    <Arwes pattern="images/glow.png" style={{ padding: 20 }}>
      <div style={{ padding: 20, textAlign: 'center'}}>
        <Heading animate>
          <p>Starwards</p>
        </Heading>
        <Button onClick={()=>{
          getRoom('space');
        }}>New Game</Button>
      </div>
    </Arwes>
  </ThemeProvider>
);

ReactDOM.render(<App />, document.querySelector('#wrapper'));
