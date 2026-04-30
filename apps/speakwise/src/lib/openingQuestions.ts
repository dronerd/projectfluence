export type PracticeMode = "speaking" | "writing";
export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const OPENING_QUESTIONS: Record<string, Record<CEFRLevel, Record<PracticeMode, string>>> = {
  "Computer Science & Technology": {
    A1: { 
      speaking: "What technology do you use every day?", 
      writing: "Write 3-4 sentences about one app or device you use every day." 
    },
    A2: { 
      speaking: "Which app or website is useful for you, and why?", 
      writing: "Write a short paragraph about an app or website that helps you." 
    },
    B1: { 
      speaking: "How has technology changed the way students learn?", 
      writing: "Write one paragraph explaining how technology helps or distracts students." 
    },
    B2: { 
      speaking: "Do you think AI will make education better or worse? Why?", 
      writing: "Write a balanced paragraph about one benefit and one risk of AI in education." 
    },
    C1: { 
      speaking: "How should society balance innovation in AI with privacy and safety?", 
      writing: "Write a concise argument about how governments should regulate AI without slowing innovation." 
    },
    C2: { 
      speaking: "What trade-offs should guide the development of powerful AI systems?", 
      writing: "Write a nuanced response evaluating the trade-off between technological progress and social responsibility." 
    },
  },
  "Medicine & Health": {
    A1: { 
      speaking: "What do you do to stay healthy?", 
      writing: "Write 3-4 sentences about your daily health habits." 
    },
    A2: { 
      speaking: "Which is important for health: sleep, food, or exercise? Why?", 
      writing: "Write a short paragraph about one healthy habit you want to keep." 
    },
    B1: { 
      speaking: "Why do many people find it hard to keep healthy habits?", 
      writing: "Write one paragraph giving advice to someone who wants a healthier lifestyle." 
    },
    B2: { 
      speaking: "Should schools teach more about mental health? Why or why not?", 
      writing: "Write a paragraph explaining how schools can support students' mental health." 
    },
    C1: { 
      speaking: "How can communities reduce health inequality?", 
      writing: "Write a concise argument about one policy that could improve public health." 
    },
    C2: { 
      speaking: "What ethical tensions appear when medical resources are limited?", 
      writing: "Write a nuanced response about how fairness should guide healthcare decisions." 
    },
  },
  "Business & Economics": {
    A1: { 
      speaking: "What job or business sounds interesting to you?", 
      writing: "Write 3-4 sentences about a job or business you like." 
    },
    A2: { 
      speaking: "Would you rather work for a company or start your own business?", 
      writing: "Write a short paragraph about a product or service you would like to sell." 
    },
    B1: { 
      speaking: "What makes a company successful?", 
      writing: "Write one paragraph about one skill people need at work." 
    },
    B2: { 
      speaking: "Is remote work good for companies and workers?", 
      writing: "Write a paragraph comparing one advantage and one disadvantage of remote work." 
    },
    C1: { 
      speaking: "How should businesses balance profit with social responsibility?", 
      writing: "Write a concise argument about whether companies should prioritize sustainability." 
    },
    C2: { 
      speaking: "What responsibilities do global companies have during economic uncertainty?", 
      writing: "Write a nuanced response evaluating the role of corporations in unstable economies." 
    },
  },
  "Environmental Science & Sustainability": {
    A1: { 
      speaking: "What can you do to help the environment?", 
      writing: "Write 3-4 sentences about one simple way to protect nature." 
    },
    A2: { 
      speaking: "Do you think recycling is easy or difficult? Why?", 
      writing: "Write a short paragraph about how people can use less plastic." 
    },
    B1: { 
      speaking: "Why is climate change a difficult problem to solve?", 
      writing: "Write one paragraph about a local environmental problem and one solution." 
    },
    B2: { 
      speaking: "Should governments make stricter rules to protect the environment?", 
      writing: "Write a paragraph giving one reason for and one reason against stricter environmental laws." 
    },
    C1: { 
      speaking: "How can countries cooperate on climate action while protecting their economies?", 
      writing: "Write a concise argument about the most effective climate policy." 
    },
    C2: { 
      speaking: "What ethical duties do current generations have toward future generations?", 
      writing: "Write a nuanced response about intergenerational responsibility and sustainability." 
    },
  },
  "Law & Politics": {
    A1: { 
      speaking: "What rule is important at school or work?", 
      writing: "Write 3-4 sentences about one rule that helps people." 
    },
    A2: { 
      speaking: "What makes a good leader?", 
      writing: "Write a short paragraph about a good leader you know or admire." 
    },
    B1: { 
      speaking: "Why is voting important in a society?", 
      writing: "Write one paragraph about why people should follow laws." 
    },
    B2: { 
      speaking: "Should young people be more involved in politics?", 
      writing: "Write a paragraph explaining how young people can participate in society." 
    },
    C1: { 
      speaking: "How can democratic societies respond to misinformation?", 
      writing: "Write a concise argument about how free speech and public safety should be balanced." 
    },
    C2: { 
      speaking: "What principles should guide lawmaking in a divided society?", 
      writing: "Write a nuanced response about justice, compromise, and legitimacy in politics." 
    },
  },
  "Engineering": {
    A1: { 
      speaking: "What machine or tool do you use often?", 
      writing: "Write 3-4 sentences about a machine that helps you." 
    },
    A2: { 
      speaking: "What would you like to build or design?", 
      writing: "Write a short paragraph about something useful you would like to make." 
    },
    B1: { 
      speaking: "What problem in daily life could engineers solve?", 
      writing: "Write one paragraph describing a problem and a simple engineering solution." 
    },
    B2: { 
      speaking: "Should engineers focus more on cost, safety, or sustainability?", 
      writing: "Write a paragraph comparing two priorities in engineering design." 
    },
    C1: { 
      speaking: "How should engineers make decisions when safety and budget conflict?", 
      writing: "Write a concise argument about the engineer's responsibility to the public." 
    },
    C2: { 
      speaking: "How do engineering choices shape society beyond their technical purpose?", 
      writing: "Write a nuanced response about the social consequences of infrastructure or technology design." 
    },
  },
  "Art & Culture": {
    A1: { 
      speaking: "What kind of art or music do you like?", 
      writing: "Write 3-4 sentences about your favorite type of art, music, or cultural activity." 
    },
    A2: { 
      speaking: "Why is art important in society?", 
      writing: "Write a short paragraph about a famous artist or cultural tradition you admire." 
    },
    B1: { 
      speaking: "How does culture differ from country to country?", 
      writing: "Write one paragraph comparing cultural practices from two different countries." 
    },
    B2: { 
      speaking: "Should governments fund the arts even during economic difficulties?", 
      writing: "Write a paragraph presenting both sides of funding public arts programs." 
    },
    C1: { 
      speaking: "How does art challenge or reflect societal values?", 
      writing: "Write a concise argument about the role of controversial art in society." 
    },
    C2: { 
      speaking: "What is the relationship between cultural preservation and modernization?", 
      writing: "Write a nuanced response exploring how societies can honor tradition while embracing change." 
    },
  },
  "Education & Learning": {
    A1: { 
      speaking: "What is your favorite subject to learn about?", 
      writing: "Write 3-4 sentences about your favorite subject or learning experience." 
    },
    A2: { 
      speaking: "How do you prefer to learn: in a classroom or online?", 
      writing: "Write a short paragraph about the best way for you to learn English." 
    },
    B1: { 
      speaking: "What are the advantages and disadvantages of traditional school?", 
      writing: "Write one paragraph about what makes a good teacher." 
    },
    B2: { 
      speaking: "How should education prepare students for the future job market?", 
      writing: "Write a paragraph arguing for or against standardized testing in schools." 
    },
    C1: { 
      speaking: "How can education systems adapt to rapid technological change?", 
      writing: "Write a concise argument about the purpose of higher education today." 
    },
    C2: { 
      speaking: "What role should education play in addressing global challenges?", 
      writing: "Write a nuanced response about equitable access to quality education worldwide." 
    },
  },
  "Sports & Fitness": {
    A1: { 
      speaking: "What sports or physical activities do you enjoy?", 
      writing: "Write 3-4 sentences about your favorite sport or physical activity." 
    },
    A2: { 
      speaking: "Why is regular exercise important?", 
      writing: "Write a short paragraph about the health benefits of playing sports." 
    },
    B1: { 
      speaking: "How have professional sports changed in recent years?", 
      writing: "Write one paragraph about the role of sports in youth development." 
    },
    B2: { 
      speaking: "Should professional athletes earn extremely high salaries?", 
      writing: "Write a paragraph exploring the connection between sports and national identity." 
    },
    C1: { 
      speaking: "How does the sports industry impact society and the environment?", 
      writing: "Write a concise argument about fairness and competition in elite sports." 
    },
    C2: { 
      speaking: "What ethical questions arise from modern sports science and enhancement?", 
      writing: "Write a nuanced response about balancing athletic excellence with athlete wellbeing." 
    },
  },
  "Travel & Culture Exchange": {
    A1: { 
      speaking: "Where would you like to travel, and why?", 
      writing: "Write 3-4 sentences about a place you would like to visit." 
    },
    A2: { 
      speaking: "What is interesting about your own country that visitors should see?", 
      writing: "Write a short paragraph about a memorable travel experience." 
    },
    B1: { 
      speaking: "How does travel change people's perspectives?", 
      writing: "Write one paragraph about the benefits of traveling to different countries." 
    },
    B2: { 
      speaking: "Does tourism help or harm local communities?", 
      writing: "Write a paragraph discussing cultural sensitivity when traveling abroad." 
    },
    C1: { 
      speaking: "How can tourism be sustainable and respectful of local cultures?", 
      writing: "Write a concise argument about the role of international travel in education." 
    },
    C2: { 
      speaking: "What responsibilities do travelers have toward host communities?", 
      writing: "Write a nuanced response about balancing tourism development with cultural preservation." 
    },
  },
  "Food & Nutrition": {
    A1: { 
      speaking: "What is your favorite food, and why do you like it?", 
      writing: "Write 3-4 sentences about your favorite food or meal." 
    },
    A2: { 
      speaking: "What food is traditional in your country?", 
      writing: "Write a short paragraph about a healthy eating habit you want to develop." 
    },
    B1: { 
      speaking: "How has food culture changed over time?", 
      writing: "Write one paragraph about the importance of balanced nutrition." 
    },
    B2: { 
      speaking: "Should there be stricter regulations on the food industry?", 
      writing: "Write a paragraph exploring the impact of food choices on the environment." 
    },
    C1: { 
      speaking: "How can food security be improved globally?", 
      writing: "Write a concise argument about sustainable agriculture and food production." 
    },
    C2: { 
      speaking: "What ethical and environmental issues surround global food systems?", 
      writing: "Write a nuanced response about food justice and equitable access to nutrition." 
    },
  },
  "Social Media & Digital Life": {
    A1: { 
      speaking: "Do you use social media? What apps do you use?", 
      writing: "Write 3-4 sentences about how you use social media or the internet." 
    },
    A2: { 
      speaking: "What are the good and bad things about social media?", 
      writing: "Write a short paragraph about how social media affects friendships." 
    },
    B1: { 
      speaking: "How has social media changed communication?", 
      writing: "Write one paragraph about the impact of social media on teenagers." 
    },
    B2: { 
      speaking: "Should social media companies be regulated more strictly?", 
      writing: "Write a paragraph discussing privacy concerns in the digital age." 
    },
    C1: { 
      speaking: "How does digital technology affect human relationships and mental health?", 
      writing: "Write a concise argument about the responsibility of tech companies toward users." 
    },
    C2: { 
      speaking: "What is the role of social media in shaping public opinion and democracy?", 
      writing: "Write a nuanced response about balancing innovation, privacy, and digital rights." 
    },
  },
};
