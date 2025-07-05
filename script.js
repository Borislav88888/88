// Intersection Observer для анимации появления секций
const observerOptions = {
  threshold: 0.3,
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

// Отслеживаем все секции проекта
const projectSections = document.querySelectorAll('.project');
projectSections.forEach((section) => observer.observe(section));