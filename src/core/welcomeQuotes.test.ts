import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { quotes } from '../data/welcomeQuotes';
test('welcome quotes have identified authors, sources and local portraits',()=>{
  assert.ok(quotes.length >= 30);
  assert.equal(new Set(quotes.map(q=>q.text)).size, quotes.length);
  for(const quote of quotes) {
    assert.ok(quote.text.trim() && quote.author.trim() && !/неизвестен/i.test(quote.author));
    assert.ok(quote.quoteSource.startsWith('https://'));
    assert.ok(quote.portrait && fs.statSync(`public${quote.portrait}`).size>0,quote.author);
    assert.ok(quote.source?.startsWith('https://') && quote.credit,quote.author);
  }
});
