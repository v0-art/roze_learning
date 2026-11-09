// Loaded only into the isolated test server process; production generates real challenges.
import svgCaptcha from 'svg-captcha';
svgCaptcha.create = () => ({text:'Ab3cDe', data:'<svg xmlns="http://www.w3.org/2000/svg" width="250" height="80"><text x="20" y="50">Ab3cDe</text></svg>'});
