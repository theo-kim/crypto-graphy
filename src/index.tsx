import * as React from 'react';
import { render } from 'react-dom';

import App from './App';

document.addEventListener('contextmenu', function(event){event.preventDefault();})

render(<App />, document.getElementById('main'));