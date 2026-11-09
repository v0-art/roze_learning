import { portraitCredits } from './portraitCredits';

/** Short quotations in Russian translation. Sources refer to the original words or their documented attribution. */
export interface WelcomeQuote { text:string; author:string; quoteSource:string; portrait?:string; credit?:string; source?:string; position?:string }
const quoteTexts: WelcomeQuote[] = [
  {text:'Я недостаточно молод, чтобы знать всё.',author:'Джеймс Мэтью Барри',quoteSource:'https://quoteinvestigator.com/2020/10/30/young-know/',portrait:'/portraits/barrie.jpg',credit:'Библиотека Конгресса · общественное достояние',source:'https://commons.wikimedia.org/wiki/File:Sir_James_M._Barrie.jpg'},
  {text:'Наука — это знание, которое мы понимаем достаточно хорошо, чтобы научить ему компьютер.',author:'Дональд Кнут',quoteSource:'https://paulgraham.com/knuth.html',portrait:'/portraits/knuth.jpg',credit:'Фото: Alex Handy · CC BY-SA 2.0, кадрировано',source:'https://commons.wikimedia.org/wiki/File:Donald_Ervin_Knuth_(cropped).jpg'},
  {text:'Мы видим впереди лишь на небольшое расстояние, но и там видно немало того, что нужно сделать.',author:'Алан Тьюринг',quoteSource:'https://en.wikiquote.org/wiki/Alan_Turing'},
  {text:'Искусство программирования — это искусство управлять сложностью.',author:'Эдсгер Дейкстра',quoteSource:'https://en.wikiquote.org/wiki/Edsger_W._Dijkstra'},
  {text:'Цель вычислений — понимание, а не числа.',author:'Ричард Хэмминг',quoteSource:'https://history.computer.org/pioneers/hamming.html'},
  {text:'Ошибки, возникающие из-за отсутствия фактов, многочисленнее и долговечнее ошибок рассуждения о верных данных.',author:'Чарльз Бэббидж',quoteSource:'https://en.wikiquote.org/wiki/Charles_Babbage'},
  {text:'Само знание — сила.',author:'Фрэнсис Бэкон',quoteSource:'https://en.wikiquote.org/wiki/Francis_Bacon'},
  {text:'Если я видел дальше других, то потому, что стоял на плечах гигантов.',author:'Исаак Ньютон',quoteSource:'https://en.wikiquote.org/wiki/Isaac_Newton'},
  {text:'Невежество чаще порождает уверенность, чем знание.',author:'Чарльз Дарвин',quoteSource:'https://en.wikiquote.org/wiki/The_Descent_of_Man,_and_Selection_in_Relation_to_Sex'},
  {text:'Тому, что нужно научиться делать, мы учимся, делая это.',author:'Аристотель',quoteSource:'https://en.wikiquote.org/wiki/Aristotle'},
  {text:'В области наблюдений случай благоприятствует подготовленному уму.',author:'Луи Пастер',quoteSource:'https://en.wikiquote.org/wiki/Louis_Pasteur'},
  {text:'Великая трагедия науки — гибель прекрасной гипотезы от безобразного факта.',author:'Томас Генри Гексли',quoteSource:'https://en.wikiquote.org/wiki/Thomas_Henry_Huxley'},
  {text:'Подобно тому как железо ржавеет от бездействия, бездействие губит и ум.',author:'Леонардо да Винчи',quoteSource:'https://en.wikiquote.org/wiki/Leonardo_da_Vinci'},
  {text:'Воображение важнее знания.',author:'Альберт Эйнштейн',quoteSource:'https://en.wikiquote.org/wiki/Imagination'},
  {text:'Чего я не могу создать, того я не понимаю.',author:'Ричард Фейнман',quoteSource:'https://en.wikiquote.org/wiki/Richard_Feynman'},
  {text:'Совершенство достигнуто не тогда, когда нечего добавить, а тогда, когда нечего убрать.',author:'Антуан де Сент-Экзюпери',quoteSource:'https://en.wikiquote.org/wiki/Antoine_de_Saint-Exupery'},
  {text:'Книга Вселенной написана языком математики.',author:'Галилео Галилей',quoteSource:'https://en.wikiquote.org/wiki/Galileo_Galilei'},
  {text:'Я мыслю, следовательно, я существую.',author:'Рене Декарт',quoteSource:'https://en.wikiquote.org/wiki/Rene_Descartes'},
  {text:'Все модели ошибочны, но некоторые полезны.',author:'Джордж Бокс',quoteSource:'https://en.wikiquote.org/wiki/Talk:George_E._P._Box'},
  {text:'Жизнь никому из нас не даётся легко. Но что из того? Нужно упорство и прежде всего уверенность в себе.',author:'Мария Склодовская-Кюри',quoteSource:'https://en.wikiquote.org/wiki/Marie_Curie'},
  {text:'Чтобы повелевать природой, надо ей повиноваться.',author:'Фрэнсис Бэкон',quoteSource:'https://en.wikiquote.org/wiki/Francis_Bacon'},
  {text:'Проверка программы может показать наличие ошибок, но не их отсутствие.',author:'Эдсгер Дейкстра',quoteSource:'https://en.wikiquote.org/wiki/Edsger_W._Dijkstra'},
  {text:'Недостаточно знать теорию; нужно уметь её применять.',author:'Ричард Хэмминг',quoteSource:'https://en.wikiquote.org/wiki/Richard_Hamming'},
  {text:'Все люди от природы стремятся к знанию.',author:'Аристотель',quoteSource:'https://en.wikiquote.org/wiki/Aristotle'},
  {text:'Нельзя ожидать, что прежде не сделанное удастся совершить средствами, которые уже испробованы.',author:'Фрэнсис Бэкон',quoteSource:'https://en.wikiquote.org/wiki/Francis_Bacon'},
  {text:'Без эксперимента я ничто.',author:'Майкл Фарадей',quoteSource:'https://en.wikiquote.org/wiki/Michael_Faraday'},
  {text:'Простота — великая добродетель, но для её достижения нужен тяжёлый труд.',author:'Эдсгер Дейкстра',quoteSource:'https://en.wikiquote.org/wiki/Edsger_W._Dijkstra'},
  {text:'Главное — не переставать задавать вопросы.',author:'Альберт Эйнштейн',quoteSource:'https://en.wikiquote.org/wiki/Albert_Einstein'},
  {text:'Учёба без увлечения портит память: она не сохраняет того, что воспринимает.',author:'Леонардо да Винчи',quoteSource:'https://en.wikiquote.org/wiki/Leonardo_da_Vinci'},
  {text:'Преждевременная оптимизация — корень всех зол в программировании.',author:'Дональд Кнут',quoteSource:'https://en.wikiquote.org/wiki/Donald_Knuth'},
  {text:'Известное конечно, неизвестное бесконечно.',author:'Томас Генри Гексли',quoteSource:'https://en.wikiquote.org/wiki/Thomas_Henry_Huxley'},
];

export const quotes: WelcomeQuote[] = quoteTexts.map(quote => ({...quote, ...portraitCredits[quote.author]}));
