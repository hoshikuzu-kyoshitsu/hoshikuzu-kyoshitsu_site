document.addEventListener('DOMContentLoaded', () => {
    // Opening Animation
    const openingScreen = document.getElementById('opening-screen');
    if (openingScreen) {
        // Start animation slightly after load to ensure smooth rendering
        setTimeout(() => {
            // Step 1: Fade in/float up logo
            document.body.classList.add('opening-active');

            // Step 2: Open curtains after logo is visible
            setTimeout(() => {
                document.body.classList.add('opening-finished');

                // Optional: Remove from DOM or fully hide after transition
                setTimeout(() => {
                    openingScreen.style.display = 'none';
                }, 1500); // 1.5s matches CSS transition

            }, 2000); // Wait 2 seconds for logo to be seen

        }, 500);
    }

    // Hero Slideshow
    const slideContainer = document.getElementById('slideshow');
    if (slideContainer) {
        const images = [
            'assets/images/photo/VRChat_2025-10-29_21-18-42.710_3840x2160.png',
            'assets/images/photo/VRChat_2025-10-29_21-45-29.129_3840x2160.png',
            'assets/images/photo/VRChat_2025-10-29_21-45-39.977_3840x2160.png',
            'assets/images/photo/VRChat_2025-11-12_21-28-14.785_3840x2160.png',
            'assets/images/photo/VRChat_2025-12-10_21-41-48.470_3840x2160.png',
            'assets/images/photo/VRChat_2026-01-07_21-42-04.631_3840x2160.png'
        ];

        // Create slide elements
        images.forEach((src, index) => {
            const slide = document.createElement('div');
            slide.classList.add('slide');
            slide.style.backgroundImage = `url('${src}')`;
            if (index === 0) slide.classList.add('active');
            slideContainer.appendChild(slide);
        });

        // Cycle slides
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');

        setInterval(() => {
            if (slides.length > 0) {
                slides[currentSlide].classList.remove('active');
                currentSlide = (currentSlide + 1) % slides.length;
                slides[currentSlide].classList.add('active');
            }
        }, 5000); // Change every 5 seconds
    }

    loadCasts().then((casts) => {
        const sorted = sortCastsByGrade(casts);
        renderCastCarousel(sorted);
        renderCastGrid(sorted);
        renderCastDetail(sorted);
        startCastCarousel();
    });
});

const FALLBACK_CAST_IMAGE = 'assets/images/logo.png';

function pickField(row, keys) {
    const lower = {};
    Object.keys(row).forEach((key) => {
        lower[String(key).trim().toLowerCase()] = String(row[key] ?? '').trim();
    });
    for (const key of keys) {
        const value = lower[key.toLowerCase()];
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

function slugId(name, explicit) {
    return explicit || name;
}

function detailHref(cast) {
    return `cast-detail.html?id=${encodeURIComponent(cast.id)}`;
}

function normalizeCast(raw) {
    const name = raw.name || '';
    const photos = (raw.photos || [])
        .map((url) => normalizeImageUrl(url))
        .filter(Boolean)
        .slice(0, 3);
    const icon = normalizeImageUrl(raw.icon) || photos[0] || FALLBACK_CAST_IMAGE;

    return {
        id: slugId(name, raw.id),
        name,
        gender: raw.gender || '',
        race: raw.race || '',
        grade: raw.grade || '',
        personality: raw.personality || '',
        birthday: raw.birthday || '',
        color: normalizeColor(raw.color),
        quote: raw.quote || '',
        icon,
        photos,
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
            id: pickField(row, ['id', 'ID']),
            name,
            gender: pickField(row, ['性別', 'gender']),
            race: pickField(row, ['種族', 'race']),
            grade: pickField(row, ['学年', 'grade', 'role']),
            personality: pickField(row, ['性格', 'personality']),
            birthday: pickField(row, ['誕生日', 'birthday']),
            color: pickField(row, ['イメージカラー', 'color', 'イメージカラーコード']),
            quote: pickField(row, ['一言', '紹介', 'キャッチ', 'quote', 'catch']),
            icon: pickField(row, ['アイコン', 'icon', '画像', 'image']),
            photos,
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

async function loadCasts() {
    const csvUrl = window.SITE_CONFIG && window.SITE_CONFIG.castsCsvUrl;

    if (csvUrl) {
        try {
            const response = await fetch(csvUrl);
            if (response.ok) {
                const casts = rowsToCasts(parseCsv(await response.text()));
                if (casts.length) return casts;
            }
        } catch (error) {
            console.warn('Spreadsheet fetch failed, using data/casts.json', error);
        }
    }

    const jsonResponse = await fetch('data/casts.json');
    const data = jsonResponse.ok ? await jsonResponse.json() : [];
    return (Array.isArray(data) ? data : [])
        .map((cast) => normalizeCast({
            ...cast,
            photos: Array.isArray(cast.photos)
                ? cast.photos
                : [cast.photo1, cast.photo2, cast.photo3].filter(Boolean)
        }))
        .filter((cast) => cast.name);
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

function createIcon(src, alt) {
    const img = document.createElement('img');
    img.className = 'cast-bust';
    img.src = src;
    img.alt = alt;
    img.addEventListener('error', () => {
        img.src = FALLBACK_CAST_IMAGE;
    });
    return img;
}

function renderCastCarousel(casts) {
    const carousel = document.getElementById('castCarousel');
    if (!carousel) return;

    const list = casts;
    carousel.replaceChildren();

    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'cast-empty';
        empty.textContent = 'キャスト情報を準備中です。';
        carousel.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((cast) => {
        const card = document.createElement('a');
        card.className = 'carousel-card';
        card.href = detailHref(cast);
        applyCastAccent(card, cast.color);

        const imageWrap = document.createElement('div');
        imageWrap.className = 'cast-bust-wrap';
        imageWrap.appendChild(createIcon(cast.icon, cast.name));

        const name = document.createElement('h3');
        name.textContent = cast.name;

        const quote = document.createElement('p');
        quote.textContent = formatQuote(cast.quote);

        card.append(imageWrap, name, quote);
        fragment.appendChild(card);
    });
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

        const card = document.createElement('a');
        card.className = 'popout-card';
        card.href = detailHref(cast);
        applyCastAccent(card, cast.color);

        const imageWrap = document.createElement('div');
        imageWrap.className = 'popout-image-wrapper';
        imageWrap.appendChild(createIcon(cast.icon, cast.name));

        const info = document.createElement('div');
        info.className = 'popout-info';
        const name = document.createElement('h3');
        name.textContent = cast.name;
        info.appendChild(name);

        const quote = document.createElement('p');
        quote.textContent = formatQuote(cast.quote);
        info.appendChild(quote);

        card.append(imageWrap, info);
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

function renderCastDetail(casts) {
    const root = document.getElementById('castDetail');
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const cast = casts.find((item) => item.id === id)
        || casts.find((item) => item.name === id);

    if (!cast) {
        const message = document.createElement('p');
        message.className = 'cast-empty';
        message.textContent = 'キャストが見つかりませんでした。';
        root.replaceChildren(message);
        return;
    }

    document.title = `${cast.name} - ほしくず教室`;
    applyCastAccent(root, cast.color);

    const photos = document.createElement('div');
    photos.className = `cast-detail-photos count-${Math.max(cast.photos.length, 1)}`;
    const photoUrls = cast.photos.length ? cast.photos : [cast.icon];
    photoUrls.forEach((url) => {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = url;
        img.alt = cast.name;
        img.addEventListener('error', () => {
            img.src = FALLBACK_CAST_IMAGE;
        });
        figure.appendChild(img);
        photos.appendChild(figure);
    });

    const profile = document.createElement('div');
    profile.className = 'cast-detail-profile';

    const heading = document.createElement('h2');
    heading.className = 'cast-detail-name';
    heading.textContent = cast.name;
    profile.appendChild(heading);

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
    profile.appendChild(list);

    const quoteBlock = document.createElement('p');
    quoteBlock.className = 'cast-detail-quote';
    quoteBlock.textContent = `一言：${formatQuote(cast.quote) || '—'}`;
    profile.appendChild(quoteBlock);

    root.replaceChildren(photos, profile);
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
