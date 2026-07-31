(function attachMovieMemoryTicketResolver(root) {
  'use strict';

  const FORMAT_TOKENS = new Set([
    '2d', '3d', '4dx', 'mx4d', 'imax', 'screenx', 'laser', 'digital', 'atmos',
    'eng', 'english', 'en', 'thai', 'th', 'sub', 'subtitle', 'dub', 'soundtrack',
    'พากย์ไทย', 'ซับไทย', 'บรรยายไทย'
  ]);
  const TITLE_STOP_WORDS = new Set(['a', 'an', 'the', 'movie', 'film']);
  const NUMBER_TOKENS = new Map([
    ['one', '1'],
    ['first', '1'],
    ['p1', '1'],
    ['pt1', '1'],
    ['part1', '1'],
    ['two', '2'],
    ['second', '2'],
    ['ii', '2'],
    ['p2', '2'],
    ['pt2', '2'],
    ['part2', '2'],
    ['three', '3'],
    ['third', '3'],
    ['iii', '3'],
    ['p3', '3'],
    ['pt3', '3'],
    ['part3', '3'],
    ['four', '4'],
    ['fourth', '4'],
    ['iv', '4'],
    ['p4', '4'],
    ['pt4', '4'],
    ['part4', '4']
  ]);

  function safeTitle(value) {
    return typeof value === 'string' ? value.trim().slice(0, 140) : '';
  }

  function normalizeTitle(value) {
    return safeTitle(value)
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .replace(/&/g, ' and ')
      .replace(/[’']/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactTitle(value) {
    return normalizeTitle(value).replace(/\s+/g, '');
  }

  function canonicalToken(token) {
    return NUMBER_TOKENS.get(token) || token;
  }

  function titleTokens(value) {
    return normalizeTitle(value)
      .split(' ')
      .map(canonicalToken)
      .filter(token => token && !TITLE_STOP_WORDS.has(token));
  }

  function stripTicketDecorators(value) {
    const title = safeTitle(value);
    if (!title) return '';
    const withoutFormatGroups = title.replace(/[\[(]([^\])]{1,30})[\])]/g, (full, inner) => {
      const tokens = normalizeTitle(inner).split(' ').filter(Boolean);
      return tokens.length && tokens.every(token => FORMAT_TOKENS.has(token) || /^\d+d$/.test(token))
        ? ' '
        : full;
    });
    return normalizeTitle(withoutFormatGroups)
      .split(' ')
      .filter(token => !FORMAT_TOKENS.has(token) && !/^(?:screen|cinema|โรง)\d+$/i.test(token))
      .join(' ')
      .trim();
  }

  function repairOcrTitle(value) {
    const numberWords = ['zero', 'one', 'two', 'three', 'four'];
    return stripTicketDecorators(value)
      .split(' ')
      .flatMap(token => {
        const partMatch = token.match(/^(?:p|pt|part)([1-4])$/);
        if (partMatch) return ['part', numberWords[Number(partMatch[1])]];
        if (/[a-z]/.test(token) && /\d/.test(token)) return [token.replace(/0/g, 'o')];
        return [token];
      })
      .join(' ')
      .trim();
  }

  function identityTitleVariants(ticket) {
    const suppliedCandidates = Array.isArray(ticket?.titleCandidates) ? ticket.titleCandidates : [];
    const rawTitles = [ticket?.title, ticket?.originalTitle, ...suppliedCandidates]
      .map(safeTitle)
      .filter(Boolean);
    const variants = [];
    const add = value => {
      const title = safeTitle(value);
      if (!title) return;
      const key = normalizeTitle(title);
      if (!key || variants.some(item => normalizeTitle(item) === key)) return;
      variants.push(title);
    };

    rawTitles.forEach(add);
    rawTitles.forEach(title => {
      add(stripTicketDecorators(title));
      add(repairOcrTitle(title));
    });
    return variants.slice(0, 12);
  }

  function buildSearchQueries(ticket) {
    const identityTitles = identityTitleVariants(ticket);
    const queries = [];
    const add = value => {
      const query = safeTitle(value);
      if (!query) return;
      const key = normalizeTitle(query);
      if (!key || queries.some(item => normalizeTitle(item) === key)) return;
      queries.push(query);
    };

    identityTitles.forEach(add);
    identityTitles.forEach(title => {
      title
        .split(/\s(?:[|/•·]|-{2,})\s/)
        .map(stripTicketDecorators)
        .filter(part => compactTitle(part).length >= 4)
        .forEach(add);
      const repairedTokens = repairOcrTitle(title).split(' ').filter(Boolean);
      if (repairedTokens.length >= 3 && repairedTokens[0].length <= 2) {
        add(repairedTokens.slice(1).join(' '));
      }
      const distinctiveTokens = repairedTokens.filter(token =>
        token.length >= 3
        && token !== 'part'
        && !['one', 'two', 'three', 'four'].includes(token)
      );
      if (distinctiveTokens.length >= 2 && distinctiveTokens.length < repairedTokens.length) {
        add(distinctiveTokens.join(' '));
      }
    });
    return queries.slice(0, 8);
  }

  function editDistance(first, second) {
    const a = first.slice(0, 90);
    const b = second.slice(0, 90);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= b.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function titleSimilarity(first, second) {
    const a = compactTitle(first);
    const b = compactTitle(second);
    if (!a || !b) return 0;
    return 1 - (editDistance(a, b) / Math.max(a.length, b.length));
  }

  function titlePairScore(wantedTitle, availableTitle) {
    const wanted = normalizeTitle(wantedTitle);
    const available = normalizeTitle(availableTitle);
    const wantedCompact = compactTitle(wanted);
    const availableCompact = compactTitle(available);
    if (!wantedCompact || !availableCompact) return 0;
    if (wanted === available) return 150;
    if (wantedCompact === availableCompact) return 146;

    const shorterLength = Math.min(wantedCompact.length, availableCompact.length);
    const lengthRatio = shorterLength / Math.max(wantedCompact.length, availableCompact.length);
    if (
      shorterLength >= 5
      && lengthRatio >= 0.6
      && (wantedCompact.startsWith(availableCompact) || availableCompact.startsWith(wantedCompact))
    ) {
      return 116;
    }
    if (
      shorterLength >= 7
      && lengthRatio >= 0.65
      && (wantedCompact.includes(availableCompact) || availableCompact.includes(wantedCompact))
    ) {
      return 104;
    }

    const similarity = titleSimilarity(wanted, available);
    let fuzzyScore = 0;
    if (shorterLength >= 5 && similarity >= 0.9) fuzzyScore = 114;
    else if (shorterLength >= 5 && similarity >= 0.82) fuzzyScore = 96;
    else if (shorterLength >= 6 && similarity >= 0.74) fuzzyScore = 82;

    const wantedTokens = titleTokens(wanted);
    const availableTokens = titleTokens(available);
    const availableSet = new Set(availableTokens);
    const commonCount = new Set(wantedTokens.filter(token => availableSet.has(token))).size;
    const wantedCoverage = commonCount / Math.max(1, wantedTokens.length);
    const availableCoverage = commonCount / Math.max(1, availableTokens.length);
    let tokenScore = 0;
    if (commonCount >= 2 && wantedCoverage >= 0.5) {
      tokenScore = 70 + (wantedCoverage * 22) + (availableCoverage * 10);
    } else if (commonCount >= 1 && wantedTokens.length === 1 && availableTokens.length === 1) {
      tokenScore = 72;
    }
    return Math.round(Math.max(fuzzyScore, tokenScore));
  }

  function ticketTitles(ticket) {
    return identityTitleVariants(ticket);
  }

  function movieTitles(movie) {
    const alternatives = Array.isArray(movie?._ticketAlternativeTitles)
      ? movie._ticketAlternativeTitles
      : Array.isArray(movie?.alternative_titles)
        ? movie.alternative_titles.map(item => item?.title)
        : [];
    return [...new Set([
      movie?.title,
      movie?.original_title,
      ...alternatives
    ].map(safeTitle).filter(Boolean))];
  }

  function releaseDateAdjustment(movie, ticket) {
    const releaseDate = safeTitle(movie?.release_date).slice(0, 10);
    const watchDate = safeTitle(ticket?.watchDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || !/^\d{4}-\d{2}-\d{2}$/.test(watchDate)) return 0;
    const releaseTime = Date.parse(`${releaseDate}T12:00:00Z`);
    const watchTime = Date.parse(`${watchDate}T12:00:00Z`);
    if (!Number.isFinite(releaseTime) || !Number.isFinite(watchTime)) return 0;
    const dayDifference = Math.round((watchTime - releaseTime) / 86400000);
    if (dayDifference < -45) return -38;
    if (dayDifference >= -45 && dayDifference <= 550) return 6;
    return 0;
  }

  function scoreMovie(movie, ticket) {
    const wantedTitles = ticketTitles(ticket);
    const availableTitles = movieTitles(movie);
    let titleScore = 0;
    wantedTitles.forEach(wanted => {
      availableTitles.forEach(available => {
        titleScore = Math.max(titleScore, titlePairScore(wanted, available));
      });
    });
    const searchRank = Number.isInteger(movie?._ticketSearchRank) ? movie._ticketSearchRank : 99;
    const rankBonus = searchRank < 10 ? Math.max(0, 10 - searchRank) : 0;
    const popularityBonus = titleScore >= 60
      ? Math.min(7, Math.log10(Math.max(1, Number(movie?.popularity) || 1)) * 2.5)
      : 0;
    const releaseAdjustment = releaseDateAdjustment(movie, ticket);
    return {
      movie,
      titleScore,
      score: Math.round((titleScore + rankBonus + popularityBonus + releaseAdjustment) * 10) / 10
    };
  }

  function rankMovies(movies, ticket) {
    return (Array.isArray(movies) ? movies : [])
      .map(movie => scoreMovie(movie, ticket))
      .sort((first, second) =>
        second.score - first.score
        || second.titleScore - first.titleScore
        || (Number(second.movie?.popularity) || 0) - (Number(first.movie?.popularity) || 0)
      );
  }

  function selectBestMovie(movies, ticket) {
    const ranked = rankMovies(movies, ticket);
    const best = ranked[0];
    if (!best || best.titleScore < 72 || best.score < 88) return null;
    const runnerUp = ranked.find(candidate => Number(candidate.movie?.id) !== Number(best.movie?.id));
    const isAmbiguous = runnerUp
      && best.titleScore < 140
      && runnerUp.titleScore >= 72
      && best.score - runnerUp.score < 11;
    if (isAmbiguous) return null;
    return {
      movie: best.movie,
      score: best.score,
      titleScore: best.titleScore,
      runnerUpScore: runnerUp?.score || 0
    };
  }

  root.MovieMemoryTicketResolver = Object.freeze({
    buildSearchQueries,
    identityTitleVariants,
    normalizeTitle,
    rankMovies,
    repairOcrTitle,
    scoreMovie,
    selectBestMovie,
    stripTicketDecorators,
    titlePairScore,
    titleSimilarity
  });
})(typeof window !== 'undefined' ? window : globalThis);
