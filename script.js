document.addEventListener('DOMContentLoaded', () => {
    const openingScreen = document.getElementById('opening-screen');
    if (openingScreen) {
        setTimeout(() => {
            document.body.classList.add('opening-active');
            setTimeout(() => {
                document.body.classList.add('opening-finished');
                setTimeout(() => {
                    openingScreen.style.display = 'none';
                }, 1500);
            }, 2000);
        }, 500);
    }

    loadSiteContent().then((site) => {
        applySiteLogo(site.logo);
        renderNews(site.news);
        renderSlideshow(site.slides);
        renderGallery(site.gallery);
    }).catch((error) => {
        console.error('Failed to load site content', error);
        applySiteLogo('');
        renderSlideshow([]);
    });

    loadCasts().then((casts) => {
        const sorted = sortCastsByGrade(casts);
        renderCastCarousel(sorted);
        renderCastGrid(sorted);
        renderCastDetail(sorted);
        startCastCarousel();
    }).catch((error) => {
        console.error('Failed to load casts', error);
    });
});

const FALLBACK_CAST_IMAGE = 'assets/images/logo.png';
const FALLBACK_LOGO = 'assets/images/logo.png';

function pickField(row, keys) {
    const lower = {};
    Object.keys(row).forEach((key) => {
        lower[String(key).trim().toLowerCase().replace(/\s+/g, '')] = String(row[key] ?? '').trim();
    });
    for (const key of keys) {
        const value = lower[key.toLowerCase().replace(/\s+/g, '')];
        if (value) return value;
    }
    return '';
}

function isHidden(value) {
    return ['0', 'false', 'no', '非表示', 'なし', 'ng'].includes(value.toLowerCase());
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                cell += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n' || (char === '\r' && next === '\n')) {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            if (char === '\r') i++;
        } else if (char !== '\r') {
            cell += char;
        }
    }
    if (cell.length || row.length) {
        row.push(cell);
        rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
    return rows.slice(1)
        .filter((r) => r.some((v) => String(v).trim()))
        .map((r) => {
            const obj = {};
            headers.forEach((h, i) => {
                obj[h] = r[i] ?? '';
            });
            return obj;
        });
}

function normalizeImageUrl(url) {
    if (!url) return '';

    const driveFile = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveFile) {
        return `https://drive.google.com/uc?export=view&id=${driveFile[1]}`;
    }

    const driveOpen = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (driveOpen) {
        return `https://drive.google.com/uc?export=view&id=${driveOpen[1]}`;
    }

    const githubBlob = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
    if (githubBlob) {
        return `https://raw.githubusercontent.com/${githubBlob[1]}/${githubBlob[2]}/${githubBlob[3]}/${githubBlob[4]}`;
    }

    return url;
}

function normalizeColor(value) {
    const v = String(value || '').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
    if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return `#${v}`;
    return '';
}

function detailHref(cast) {
    return `cast-detail.html?name=${encodeURIComponent(cast.name)}`;
}

function createRemoteImage(src, alt, className) {
    const img = document.createElement('img');
    if (className) img.className = className;
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    img.alt = alt || '';
    img.addEventListener('error', () => {
        img.src = FALLBACK_CAST_IMAGE;
    });
    return img;
}

async function fetchJson(path) {
    const url = new URL(path, document.baseURI);
    url.searchParams.set('t', String(Date.now()));
    const response = await fetch(url.href, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return response.json();
}

async function fetchCsvRows(csvUrl) {
    if (!csvUrl) return null;
    const response = await fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.slice(0, 200).toLowerCase().includes('<html')) return null;
    return parseCsv(text);
}

function normalizeCast(raw) {
    const name = raw.name || '';
    const photos = (raw.photos || [])
        .map((url) => normalizeImageUrl(url))
        .filter(Boolean)
        .slice(0, 3);
    const icon = normalizeImageUrl(raw.icon) || photos[0] || FALLBACK_CAST_IMAGE;

    return {
        name,
        kana: raw.kana || '',
        gender: raw.gender || '',
        race: raw.race || '',
        grade: raw.grade || '',
        personality: raw.personality || '',
        birthday: raw.birthday || '',
        color: normalizeColor(raw.color),
        quote: raw.quote || '',
        icon,
        photos,
        video: raw.video || '',
        x: raw.x || '',
        hidden: Boolean(raw.hidden)
    };
}

function rowsToCasts(rows) {
    return rows.map((row) => {
        const name = pickField(row, ['名前', '氏名', 'name']);
        const visible = pickField(row, ['表示', 'visible', 'show']);
        const photos = [
            pickField(row, ['写真1', 'photo1', '画像1']),
            pickField(row, ['写真2', 'photo2', '画像2']),
            pickField(row, ['写真3', 'photo3', '画像3'])
        ].filter(Boolean);

        return normalizeCast({
            name,
            kana: pickField(row, ['フリガナ', 'ふりがな', 'kana', 'ruby']),
            gender: pickField(row, ['性別', 'gender']),
            race: pickField(row, ['種族', 'race']),
            grade: pickField(row, ['学年', 'grade', 'role']),
            personality: pickField(row, ['性格', 'personality']),
            birthday: pickField(row, ['誕生日', 'birthday']),
            color: pickField(row, ['イメージカラー', 'color', 'イメージカラーコード']),
            quote: pickField(row, ['一言', '紹介', 'キャッチ', 'quote', 'catch']),
            icon: pickField(row, ['アイコン', 'icon']),
            photos,
            video: pickField(row, ['紹介動画', '動画', 'video', 'youtube']),
            x: pickField(row, ['X', 'Twitter', 'twitter', 'xアカウント']),
            hidden: visible ? isHidden(visible) : false
        });
    }).filter((cast) => cast.name && !cast.hidden);
}

function gradeSortKey(grade) {
    const text = String(grade || '');
    let school = 50;
    if (/小学|^小(?!高)/.test(text)) school = 10;
    else if (/中学|^中/.test(text)) school = 20;
    else if (/高校|^高/.test(text)) school = 30;
    const year = parseInt((text.match(/\d+/) || ['99'])[0], 10);
    return school * 100 + year;
}

function sortCastsByGrade(casts) {
    return [...casts].sort((a, b) => {
        const gradeDiff = gradeSortKey(a.grade) - gradeSortKey(b.grade);
        if (gradeDiff !== 0) return gradeDiff;
        return a.name.localeCompare(b.name, 'ja');
    });
}

function mapCastRecords(data) {
    return (Array.isArray(data) ? data : [])
        .map((cast) => normalizeCast({
            ...cast,
            photos: Array.isArray(cast.photos)
                ? cast.photos
                : [cast.photo1, cast.photo2, cast.photo3].filter(Boolean)
        }))
        .filter((cast) => cast.name);
}

function rowsToNews(rows) {
    return rows.map((row) => ({
        date: pickField(row, ['日付', 'date', '日時']),
        category: pickField(row, ['カテゴリ', 'category', '種別']) || 'Info',
        title: pickField(row, ['タイトル', 'title', '見出し']),
        url: pickField(row, ['URL', 'url', 'リンク'])
    })).filter((item) => item.title);
}

function rowsToSlides(rows) {
    return rows.map((row) => ({
        image: normalizeImageUrl(pickField(row, ['画像', 'image', 'url', '写真'])),
        title: pickField(row, ['タイトル', 'title', '題名'])
    })).filter((item) => item.image);
}

function rowsToGallery(rows) {
    return rows.map((row) => ({
        image: normalizeImageUrl(pickField(row, ['画像', 'image', 'url', '写真'])),
        title: pickField(row, ['題名', 'タイトル', 'title', 'caption'])
    })).filter((item) => item.image);
}

async function loadCasts() {
    const csvUrl = window.SITE_CONFIG && window.SITE_CONFIG.castsCsvUrl;
    const rows = await fetchCsvRows(csvUrl).catch(() => null);
    if (rows) {
        const casts = rowsToCasts(rows);
        if (casts.length) return casts;
    }

    try {
        const casts = mapCastRecords(await fetchJson('data/casts.json'));
        if (casts.length) return casts;
    } catch (error) {
        console.warn('casts.json fetch failed, using embed', error);
    }

    return mapCastRecords(window.CASTS_EMBED);
}

async function loadSiteContent() {
    const embed = window.SITE_EMBED || { logo: '', news: [], slides: [], gallery: [] };
    const config = window.SITE_CONFIG || {};
    const site = {
        logo: embed.logo || '',
        news: Array.isArray(embed.news) ? embed.news : [],
        slides: Array.isArray(embed.slides) ? embed.slides : [],
        gallery: Array.isArray(embed.gallery) ? embed.gallery : []
    };

    const newsRows = await fetchCsvRows(config.newsCsvUrl).catch(() => null);
    if (newsRows) site.news = rowsToNews(newsRows);

    const slideRows = await fetchCsvRows(config.slidesCsvUrl).catch(() => null);
    if (slideRows) site.slides = rowsToSlides(slideRows);

    const galleryRows = await fetchCsvRows(config.galleryCsvUrl).catch(() => null);
    if (galleryRows) site.gallery = rowsToGallery(galleryRows);

    if (!site.news.length || !site.slides.length || !site.gallery.length) {
        try {
            const news = await fetchJson('data/news.json');
            if (!site.news.length && Array.isArray(news)) site.news = news;
        } catch (error) { /* keep embed */ }
        try {
            const slides = await fetchJson('data/slides.json');
            if (!site.slides.length && Array.isArray(slides)) site.slides = slides;
        } catch (error) { /* keep embed */ }
        try {
            const gallery = await fetchJson('data/gallery.json');
            if (!site.gallery.length && Array.isArray(gallery)) site.gallery = gallery;
        } catch (error) { /* keep embed */ }
    }

    site.slides = site.slides.map((item) => ({
        ...item,
        image: normalizeImageUrl(item.image || item.url || '')
    })).filter((item) => item.image);
    site.gallery = site.gallery.map((item) => ({
        ...item,
        image: normalizeImageUrl(item.image || item.url || ''),
        title: item.title || item.caption || ''
    })).filter((item) => item.image);
    site.logo = normalizeImageUrl(site.logo);

    return site;
}

function applySiteLogo(logoUrl) {
    const src = logoUrl || FALLBACK_LOGO;
    document.querySelectorAll('.js-site-logo').forEach((img) => {
        img.referrerPolicy = 'no-referrer';
        img.src = src;
        img.addEventListener('error', () => {
            img.src = FALLBACK_LOGO;
        }, { once: true });
    });
}

function renderNews(news) {
    const list = document.querySelector('.news-list');
    if (!list) return;
    list.replaceChildren();

    if (!news.length) {
        const empty = document.createElement('li');
        empty.textContent = 'お知らせはまだありません。';
        list.appendChild(empty);
        return;
    }

    news.forEach((item) => {
        const li = document.createElement('li');
        const date = document.createElement('span');
        date.className = 'date';
        date.textContent = item.date || '';
        const category = document.createElement('span');
        category.className = 'category';
        category.textContent = item.category || 'Info';
        const title = item.url ? document.createElement('a') : document.createElement('span');
        title.className = 'title';
        title.textContent = item.title;
        if (item.url) {
            title.href = item.url;
            title.target = '_blank';
            title.rel = 'noopener noreferrer';
        }
        li.append(date, category, title);
        list.appendChild(li);
    });
}

function renderSlideshow(slides) {
    const slideContainer = document.getElementById('slideshow');
    if (!slideContainer) return;
    slideContainer.replaceChildren();

    if (!slides.length) return;

    slides.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.classList.add('slide');
        slide.style.backgroundImage = `url(${JSON.stringify(item.image)})`;
        if (index === 0) slide.classList.add('active');
        slideContainer.appendChild(slide);
    });

    const nodes = slideContainer.querySelectorAll('.slide');
    let currentSlide = 0;
    setInterval(() => {
        if (nodes.length < 2) return;
        nodes[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % nodes.length;
        nodes[currentSlide].classList.add('active');
    }, 5000);
}

function renderGallery(items) {
    const grid = document.querySelector('.gallery-grid');
    if (!grid) return;
    grid.replaceChildren();

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'cast-empty';
        empty.textContent = 'ギャラリー写真を準備中です。';
        grid.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const figure = document.createElement('figure');
        figure.className = 'gallery-item';
        figure.appendChild(createRemoteImage(item.image, item.title || '', 'gallery-image'));
        if (item.title) {
            const caption = document.createElement('figcaption');
            caption.textContent = item.title;
            figure.appendChild(caption);
        }
        grid.appendChild(figure);
    });
}

function formatQuote(quote) {
    if (!quote) return '';
    return quote.startsWith('「') ? quote : `「${quote}」`;
}

function applyCastAccent(element, color) {
    if (color) {
        element.style.setProperty('--cast-accent', color);
    }
}

function createCastCard(cast, variant) {
    const card = document.createElement('a');
    card.className = variant === 'carousel' ? 'cast-card carousel-card' : 'cast-card popout-card';
    card.href = detailHref(cast);
    applyCastAccent(card, cast.color || '#3DB7AA');

    const stage = document.createElement('div');
    stage.className = 'cast-card-stage';
    const band = document.createElement('div');
    band.className = 'cast-color-band';
    const bust = document.createElement('div');
    bust.className = 'cast-bust-wrap';
    bust.appendChild(createRemoteImage(cast.icon, cast.name, 'cast-bust'));
    stage.append(band, bust);

    const body = document.createElement('div');
    body.className = 'cast-card-body';
    const name = document.createElement('h3');
    name.textContent = cast.name;
    body.appendChild(name);

    const extra = document.createElement('p');
    extra.textContent = variant === 'carousel'
        ? (cast.grade || '')
        : formatQuote(cast.quote);
    body.appendChild(extra);

    card.append(stage, body);
    return card;
}

function renderCastCarousel(casts) {
    const carousel = document.getElementById('castCarousel');
    if (!carousel) return;
    carousel.replaceChildren();

    if (!casts.length) {
        const empty = document.createElement('p');
        empty.className = 'cast-empty';
        empty.textContent = 'キャスト情報を準備中です。';
        carousel.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    casts.forEach((cast) => fragment.appendChild(createCastCard(cast, 'carousel')));
    carousel.appendChild(fragment);
}

function renderCastGrid(casts) {
    const grid = document.querySelector('.cast-page-grid');
    if (!grid) return;
    grid.replaceChildren();

    if (!casts.length) {
        const empty = document.createElement('p');
        empty.className = 'cast-empty';
        empty.textContent = 'キャスト情報を準備中です。';
        grid.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    let currentGrade = Symbol('start');

    casts.forEach((cast) => {
        const gradeLabel = cast.grade || 'その他';
        if (gradeLabel !== currentGrade) {
            currentGrade = gradeLabel;
            const heading = document.createElement('h3');
            heading.className = 'cast-grade-heading';
            heading.textContent = gradeLabel;
            fragment.appendChild(heading);
        }
        fragment.appendChild(createCastCard(cast, 'list'));
    });
    grid.appendChild(fragment);
}

function formatXLink(value) {
    const text = String(value).trim();
    if (!text) return { href: '', label: '' };
    if (/^https?:\/\//i.test(text)) {
        return { href: text, label: text };
    }
    const handle = text.startsWith('@') ? text : `@${text}`;
    return { href: `https://x.com/${handle.slice(1)}`, label: handle };
}

function createDetailPhotoViewer(cast) {
    const urls = cast.photos.length ? cast.photos : [cast.icon];
    const wrap = document.createElement('div');
    wrap.className = 'cast-detail-photos';

    const main = document.createElement('figure');
    main.className = 'cast-detail-photo-main';
    const img = createRemoteImage(urls[0], cast.name, 'cast-portrait-image');
    main.appendChild(img);
    wrap.appendChild(main);

    if (urls.length > 1) {
        const tabs = document.createElement('div');
        tabs.className = 'cast-detail-photo-tabs';
        urls.forEach((url, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cast-photo-tab' + (index === 0 ? ' active' : '');
            btn.setAttribute('aria-label', `写真${index + 1}`);
            btn.appendChild(createRemoteImage(url, `${cast.name} 写真${index + 1}`, ''));
            btn.addEventListener('click', () => {
                img.src = url;
                tabs.querySelectorAll('.cast-photo-tab').forEach((el) => el.classList.remove('active'));
                btn.classList.add('active');
            });
            tabs.appendChild(btn);
        });
        wrap.appendChild(tabs);
    }

    return wrap;
}

function renderCastDetail(casts) {
    const root = document.getElementById('castDetail');
    if (!root) return;

    const nameParam = new URLSearchParams(window.location.search).get('name')
        || new URLSearchParams(window.location.search).get('id');
    const cast = casts.find((item) => item.name === nameParam);

    if (!cast) {
        const message = document.createElement('p');
        message.className = 'cast-empty';
        message.textContent = 'キャストが見つかりませんでした。';
        root.replaceChildren(message);
        return;
    }

    document.title = `${cast.name} - ほしくず教室`;
    applyCastAccent(root, cast.color);

    const layout = document.createElement('div');
    layout.className = 'cast-detail-layout';

    const photoCol = document.createElement('div');
    photoCol.className = 'cast-detail-photo-col';
    photoCol.appendChild(createDetailPhotoViewer(cast));

    const infoCol = document.createElement('div');
    infoCol.className = 'cast-detail-info';

    const heading = document.createElement('div');
    heading.className = 'cast-detail-heading';
    const nameEl = document.createElement('h1');
    nameEl.className = 'cast-detail-name';
    nameEl.textContent = cast.name;
    heading.appendChild(nameEl);
    if (cast.kana) {
        const kana = document.createElement('p');
        kana.className = 'cast-detail-kana';
        kana.textContent = cast.kana;
        heading.appendChild(kana);
    }
    infoCol.appendChild(heading);

    const fields = [
        ['名前', cast.name],
        ['性別', cast.gender],
        ['種族', cast.race],
        ['学年', cast.grade],
        ['性格', cast.personality],
        ['誕生日', cast.birthday]
    ];
    const list = document.createElement('dl');
    list.className = 'cast-detail-list';
    fields.forEach(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value || '—';
        list.append(dt, dd);
    });

    const colorDt = document.createElement('dt');
    colorDt.textContent = 'イメージカラー';
    const colorDd = document.createElement('dd');
    colorDd.className = 'cast-color-value';
    if (cast.color) {
        const swatch = document.createElement('span');
        swatch.className = 'cast-color-swatch';
        swatch.style.backgroundColor = cast.color;
        const code = document.createElement('span');
        code.textContent = cast.color;
        colorDd.append(swatch, code);
    } else {
        colorDd.textContent = '—';
    }
    list.append(colorDt, colorDd);
    infoCol.appendChild(list);

    const quoteBlock = document.createElement('p');
    quoteBlock.className = 'cast-detail-quote';
    quoteBlock.textContent = `一言：${formatQuote(cast.quote) || '—'}`;
    infoCol.appendChild(quoteBlock);

    if (cast.video || cast.x) {
        const links = document.createElement('div');
        links.className = 'cast-detail-links';

        if (cast.video) {
            const a = document.createElement('a');
            a.className = 'cast-detail-link';
            a.href = cast.video;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = '紹介動画';
            links.appendChild(a);
        }

        const xInfo = formatXLink(cast.x);
        if (xInfo.href) {
            const a = document.createElement('a');
            a.className = 'cast-detail-link';
            a.href = xInfo.href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = xInfo.label;
            links.appendChild(a);
        }

        infoCol.appendChild(links);
    }

    layout.append(photoCol, infoCol);
    root.replaceChildren(layout);
}

function startCastCarousel() {
    const carousel = document.getElementById('castCarousel');
    if (!carousel || carousel.scrollWidth <= carousel.clientWidth) return;

    let autoScroll = setInterval(() => {
        if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 1) {
            carousel.scrollLeft = 0;
        } else {
            carousel.scrollLeft += 1;
        }
    }, 40);

    carousel.addEventListener('mouseenter', () => clearInterval(autoScroll));
    carousel.addEventListener('mouseleave', () => {
        autoScroll = setInterval(() => {
            if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 1) {
                carousel.scrollLeft = 0;
            } else {
                carousel.scrollLeft += 1;
            }
        }, 40);
    });
}
