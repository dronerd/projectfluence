export type PracticeMode = "speaking" | "writing";
export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const OPENING_QUESTIONS: Record<string, Record<CEFRLevel, Record<PracticeMode, string[]>>> = {
  "Computer Science & Technology": {
    A1: {
      speaking: [
        "What is one technology you like or think about often?",
        "What do you like about a smartphone?",
        "Do you use a learning app in your daily life?",
        "What is one technology that feels new or interesting to you?",
        "Where do you usually use a robot?",
        "Who helps you with technology?",
        "What technology is easy for you?",
        "What technology is difficult for you?",
        "When do you usually think about technology?",
        "Which is better for you: an AI assistant or a computer?"
      ],
      writing: [
        "What technology is important or interesting to you?",
        "How do you use, do, or experience a smartphone in daily life?",
        "What do you like about a learning app?",
        "Where do you usually see or use a robot?",
        "Who do you talk to about technology?",
        "What is one good thing about an AI assistant?",
        "What is one problem with a computer?",
        "What technology would you like to try?",
        "What technology do people around you often use?",
        "Which do you prefer: a website or a game?"
      ],
    },
    A2: {
      speaking: [
        "Why is a smartphone useful for you?",
        "How often do you use, do, or think about a learning app?",
        "What should beginners know about technology?",
        "Which is more useful: a robot or an AI assistant? Why?",
        "What is a good way to enjoy technology?",
        "How can a computer help people?",
        "What problem can happen with a website?",
        "What technology would you recommend to a friend?",
        "How is technology different now from when you were younger?",
        "What would you like to learn about technology?"
      ],
      writing: [
        "Why do many people like a smartphone?",
        "How can a learning app make daily life easier?",
        "What are two good points about a robot?",
        "What is one bad point about an AI assistant?",
        "Which technology would you choose for a busy day?",
        "How can people use a computer in a better way?",
        "What advice would you give to someone trying a website for the first time?",
        "What technology is popular in your country?",
        "How does a game help people communicate or work together?",
        "What small change related to technology could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has technology changed people's daily lives?",
        "Why do some people enjoy a smartphone while others do not?",
        "What is one problem in school or daily life that technology can improve?",
        "How can people make better choices about a learning app?",
        "What are the good and bad sides of a robot?",
        "Why is privacy important for ordinary people?",
        "What should young people learn about technology?",
        "How can families or schools support better habits around technology?",
        "What mistake do people often make with an AI assistant?",
        "How might technology be different ten years from now?"
      ],
      writing: [
        "How does technology affect students or young people?",
        "Why might a smartphone be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to technology?",
        "How can people balance convenience and responsibility when using or doing a learning app?",
        "What are two reasons why privacy matters today?",
        "How can communities encourage better decisions about technology?",
        "What should schools teach about a robot?",
        "How does money, time, or access change people's choices about technology?",
        "What example shows the positive side of an AI assistant?",
        "What example shows the negative side of a computer?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in technology: convenience or responsibility?",
        "Should schools or governments do more about privacy? Why?",
        "How can people enjoy the benefits of a smartphone while reducing the risks?",
        "What is one strong argument for and against stricter rules on online safety?",
        "How does AI in education affect ordinary families or students?",
        "Is personal choice enough to solve problems related to technology?",
        "How should leaders explain difficult decisions about screen time?",
        "What trade-off appears when people choose between cost and quality in technology?",
        "How can technology or social change improve technology?",
        "What kind of evidence would change your opinion about automation?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in technology?",
        "Which policy would be most effective for addressing privacy, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about a smartphone?",
        "What are the strongest arguments on both sides of the debate about online safety?",
        "How can institutions build trust when dealing with AI in education?",
        "Should companies, governments, or individuals take the main responsibility for problems related to technology?",
        "How does inequality influence people's choices or opportunities in technology?",
        "What would a fair compromise look like in a disagreement about screen time?",
        "How can education change public behavior related to automation?",
        "What unintended consequence could come from trying to improve technology?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in technology?",
        "What responsibility do institutions have when decisions about privacy affect vulnerable people?",
        "How can policymakers respond to online safety without creating new unfairness?",
        "What should count as success when improving technology?",
        "How can experts communicate uncertainty about AI in education to the public?",
        "When should individual freedom be limited for the sake of screen time?",
        "How can international cooperation help solve problems related to automation?",
        "What role should public trust play in decisions about technology?",
        "How can society avoid focusing only on efficiency in technology?",
        "What kind of leadership is needed when values conflict in technology?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in technology?",
        "What principles should guide decisions when privacy conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in technology are actually fair?",
        "What is the most persuasive case for prioritizing online safety over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for AI in education?",
        "What limits should be placed on powerful organizations involved in technology?",
        "How can public systems prepare for long-term challenges connected to screen time?",
        "What trade-off in technology is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about automation?",
        "What lesson from history or current society helps explain a challenge in technology?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in technology?",
        "How should society act when evidence about privacy is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of technology differently?",
        "How can long-term responsibility be taken seriously in debates about online safety?",
        "When does compromise in technology become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about AI in education?",
        "What hidden assumptions shape public debates about technology?",
        "How can decision-makers avoid solving one problem while deepening another in screen time?",
        "What responsibility do powerful countries or organizations have in shaping technology?",
        "How should human dignity influence the future of technology?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in technology?",
        "How should societies make decisions about privacy when no option is fully fair?",
        "What deeper value conflict lies beneath debates about online safety?",
        "How can institutions remain legitimate when they must make unpopular decisions about technology?",
        "What responsibilities do present generations have when their choices in technology affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about AI in education?",
        "When does neutrality become impossible in decisions about technology?",
        "How can society distinguish responsible innovation from reckless experimentation in screen time?",
        "What would a humane future for technology require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about automation?"
      ],
    },
  },
  "Medicine & Health": {
    A1: {
      speaking: [
        "What is one health habit you like or think about often?",
        "What do you like about sleep?",
        "Do you use exercise in your daily life?",
        "What is one health habit that feels new or interesting to you?",
        "Where do you usually use a healthy breakfast?",
        "Who helps you with health habit?",
        "What health habit is easy for you?",
        "What health habit is difficult for you?",
        "When do you usually think about health habit?",
        "Which is better for you: walking or water?"
      ],
      writing: [
        "What health habit is important or interesting to you?",
        "How do you use, do, or experience sleep in daily life?",
        "What do you like about exercise?",
        "Where do you usually see or use a healthy breakfast?",
        "Who do you talk to about health habit?",
        "What is one good thing about walking?",
        "What is one problem with water?",
        "What health habit would you like to try?",
        "What health habit do people around you often use?",
        "Which do you prefer: a doctor visit or medicine?"
      ],
    },
    A2: {
      speaking: [
        "Why is sleep useful for you?",
        "How often do you use, do, or think about exercise?",
        "What should beginners know about health habit?",
        "Which is more useful: a healthy breakfast or walking? Why?",
        "What is a good way to enjoy health habit?",
        "How can water help people?",
        "What problem can happen with a doctor visit?",
        "What health habit would you recommend to a friend?",
        "How is health habit different now from when you were younger?",
        "What would you like to learn about health habit?"
      ],
      writing: [
        "Why do many people like sleep?",
        "How can exercise make daily life easier?",
        "What are two good points about a healthy breakfast?",
        "What is one bad point about walking?",
        "Which health habit would you choose for a busy day?",
        "How can people use water in a better way?",
        "What advice would you give to someone trying a doctor visit for the first time?",
        "What health habit is popular in your country?",
        "How does medicine help people communicate or work together?",
        "What small change related to health habit could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has health habit changed people's daily lives?",
        "Why do some people enjoy sleep while others do not?",
        "What is one problem in daily life that health habit can improve?",
        "How can people make better choices about exercise?",
        "What are the good and bad sides of a healthy breakfast?",
        "Why is mental health important for ordinary people?",
        "What should young people learn about health habit?",
        "How can families or schools support better habits around health habit?",
        "What mistake do people often make with walking?",
        "How might health habit be different ten years from now?"
      ],
      writing: [
        "How does health habit affect students or young people?",
        "Why might sleep be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to health habit?",
        "How can people balance convenience and responsibility when using or doing exercise?",
        "What are two reasons why mental health matters today?",
        "How can communities encourage better decisions about health habit?",
        "What should schools teach about a healthy breakfast?",
        "How does money, time, or access change people's choices about health habit?",
        "What example shows the positive side of walking?",
        "What example shows the negative side of water?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in health habit: convenience or responsibility?",
        "Should schools or governments do more about mental health? Why?",
        "How can people enjoy the benefits of sleep while reducing the risks?",
        "What is one strong argument for and against stricter rules on health inequality?",
        "How does preventive care affect ordinary families or students?",
        "Is personal choice enough to solve problems related to health habit?",
        "How should leaders explain difficult decisions about aging societies?",
        "What trade-off appears when people choose between cost and quality in health habit?",
        "How can technology or social change improve health habit?",
        "What kind of evidence would change your opinion about medical costs?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in health habit?",
        "Which policy would be most effective for addressing mental health, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about sleep?",
        "What are the strongest arguments on both sides of the debate about health inequality?",
        "How can institutions build trust when dealing with preventive care?",
        "Should companies, governments, or individuals take the main responsibility for problems related to health habit?",
        "How does inequality influence people's choices or opportunities in health habit?",
        "What would a fair compromise look like in a disagreement about aging societies?",
        "How can education change public behavior related to medical costs?",
        "What unintended consequence could come from trying to improve health habit?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in health habit?",
        "What responsibility do institutions have when decisions about mental health affect vulnerable people?",
        "How can policymakers respond to health inequality without creating new unfairness?",
        "What should count as success when improving health habit?",
        "How can experts communicate uncertainty about preventive care to the public?",
        "When should individual freedom be limited for the sake of aging societies?",
        "How can international cooperation help solve problems related to medical costs?",
        "What role should public trust play in decisions about health habit?",
        "How can society avoid focusing only on efficiency in health habit?",
        "What kind of leadership is needed when values conflict in health habit?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in health habit?",
        "What principles should guide decisions when mental health conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in health habit are actually fair?",
        "What is the most persuasive case for prioritizing health inequality over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for preventive care?",
        "What limits should be placed on powerful organizations involved in health habit?",
        "How can public systems prepare for long-term challenges connected to aging societies?",
        "What trade-off in health habit is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about medical costs?",
        "What lesson from history or current society helps explain a challenge in health habit?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in health habit?",
        "How should society act when evidence about mental health is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of health habit differently?",
        "How can long-term responsibility be taken seriously in debates about health inequality?",
        "When does compromise in health habit become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about preventive care?",
        "What hidden assumptions shape public debates about health habit?",
        "How can decision-makers avoid solving one problem while deepening another in aging societies?",
        "What responsibility do powerful countries or organizations have in shaping health habit?",
        "How should human dignity influence the future of health habit?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in health habit?",
        "How should societies make decisions about mental health when no option is fully fair?",
        "What deeper value conflict lies beneath debates about health inequality?",
        "How can institutions remain legitimate when they must make unpopular decisions about health habit?",
        "What responsibilities do present generations have when their choices in health habit affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about preventive care?",
        "When does neutrality become impossible in decisions about health habit?",
        "How can society distinguish responsible innovation from reckless experimentation in aging societies?",
        "What would a humane future for health habit require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about medical costs?"
      ],
    },
  },
  "Business & Economics": {
    A1: {
      speaking: [
        "What is one job or business idea you like or think about often?",
        "What do you like about a shop?",
        "Do you use an online store in your daily life?",
        "What is one job or business idea that feels new or interesting to you?",
        "Where do you usually use a team project?",
        "Who helps you with job or business idea?",
        "What job or business idea is easy for you?",
        "What job or business idea is difficult for you?",
        "When do you usually think about job or business idea?",
        "Which is better for you: a part-time job or a new product?"
      ],
      writing: [
        "What job or business idea is important or interesting to you?",
        "How do you use, do, or experience a shop in daily life?",
        "What do you like about an online store?",
        "Where do you usually see or use a team project?",
        "Who do you talk to about job or business idea?",
        "What is one good thing about a part-time job?",
        "What is one problem with a new product?",
        "What job or business idea would you like to try?",
        "What job or business idea do people around you often use?",
        "Which do you prefer: customer service or a small business?"
      ],
    },
    A2: {
      speaking: [
        "Why is a shop useful for you?",
        "How often do you use, do, or think about an online store?",
        "What should beginners know about job or business idea?",
        "Which is more useful: a team project or a part-time job? Why?",
        "What is a good way to enjoy job or business idea?",
        "How can a new product help people?",
        "What problem can happen with customer service?",
        "What job or business idea would you recommend to a friend?",
        "How is job or business idea different now from when you were younger?",
        "What would you like to learn about job or business idea?"
      ],
      writing: [
        "Why do many people like a shop?",
        "How can an online store make daily life easier?",
        "What are two good points about a team project?",
        "What is one bad point about a part-time job?",
        "Which job or business idea would you choose for a busy day?",
        "How can people use a new product in a better way?",
        "What advice would you give to someone trying customer service for the first time?",
        "What job or business idea is popular in your country?",
        "How does a small business help people communicate or work together?",
        "What small change related to job or business idea could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has job or business idea changed people's daily lives?",
        "Why do some people enjoy a shop while others do not?",
        "What is one problem in work that job or business idea can improve?",
        "How can people make better choices about an online store?",
        "What are the good and bad sides of a team project?",
        "Why is remote work important for ordinary people?",
        "What should young people learn about job or business idea?",
        "How can families or schools support better habits around job or business idea?",
        "What mistake do people often make with a part-time job?",
        "How might job or business idea be different ten years from now?"
      ],
      writing: [
        "How does job or business idea affect students or young people?",
        "Why might a shop be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to job or business idea?",
        "How can people balance convenience and responsibility when using or doing an online store?",
        "What are two reasons why remote work matters today?",
        "How can communities encourage better decisions about job or business idea?",
        "What should schools teach about a team project?",
        "How does money, time, or access change people's choices about job or business idea?",
        "What example shows the positive side of a part-time job?",
        "What example shows the negative side of a new product?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in job or business idea: convenience or responsibility?",
        "Should schools or governments do more about remote work? Why?",
        "How can people enjoy the benefits of a shop while reducing the risks?",
        "What is one strong argument for and against stricter rules on fair wages?",
        "How does sustainability affect ordinary families or students?",
        "Is personal choice enough to solve problems related to job or business idea?",
        "How should leaders explain difficult decisions about consumer trust?",
        "What trade-off appears when people choose between cost and quality in job or business idea?",
        "How can technology or social change improve job or business idea?",
        "What kind of evidence would change your opinion about global trade?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in job or business idea?",
        "Which policy would be most effective for addressing remote work, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about a shop?",
        "What are the strongest arguments on both sides of the debate about fair wages?",
        "How can institutions build trust when dealing with sustainability?",
        "Should companies, governments, or individuals take the main responsibility for problems related to job or business idea?",
        "How does inequality influence people's choices or opportunities in job or business idea?",
        "What would a fair compromise look like in a disagreement about consumer trust?",
        "How can education change public behavior related to global trade?",
        "What unintended consequence could come from trying to improve job or business idea?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in job or business idea?",
        "What responsibility do institutions have when decisions about remote work affect vulnerable people?",
        "How can policymakers respond to fair wages without creating new unfairness?",
        "What should count as success when improving job or business idea?",
        "How can experts communicate uncertainty about sustainability to the public?",
        "When should individual freedom be limited for the sake of consumer trust?",
        "How can international cooperation help solve problems related to global trade?",
        "What role should public trust play in decisions about job or business idea?",
        "How can society avoid focusing only on efficiency in job or business idea?",
        "What kind of leadership is needed when values conflict in job or business idea?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in job or business idea?",
        "What principles should guide decisions when remote work conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in job or business idea are actually fair?",
        "What is the most persuasive case for prioritizing fair wages over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for sustainability?",
        "What limits should be placed on powerful organizations involved in job or business idea?",
        "How can public systems prepare for long-term challenges connected to consumer trust?",
        "What trade-off in job or business idea is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about global trade?",
        "What lesson from history or current society helps explain a challenge in job or business idea?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in job or business idea?",
        "How should society act when evidence about remote work is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of job or business idea differently?",
        "How can long-term responsibility be taken seriously in debates about fair wages?",
        "When does compromise in job or business idea become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about sustainability?",
        "What hidden assumptions shape public debates about job or business idea?",
        "How can decision-makers avoid solving one problem while deepening another in consumer trust?",
        "What responsibility do powerful countries or organizations have in shaping job or business idea?",
        "How should human dignity influence the future of job or business idea?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in job or business idea?",
        "How should societies make decisions about remote work when no option is fully fair?",
        "What deeper value conflict lies beneath debates about fair wages?",
        "How can institutions remain legitimate when they must make unpopular decisions about job or business idea?",
        "What responsibilities do present generations have when their choices in job or business idea affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about sustainability?",
        "When does neutrality become impossible in decisions about job or business idea?",
        "How can society distinguish responsible innovation from reckless experimentation in consumer trust?",
        "What would a humane future for job or business idea require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about global trade?"
      ],
    },
  },
  "Environmental Science & Sustainability": {
    A1: {
      speaking: [
        "What is one eco-friendly action you like or think about often?",
        "What do you like about recycling?",
        "Do you use saving water in your daily life?",
        "What is one eco-friendly action that feels new or interesting to you?",
        "Where do you usually use public transport?",
        "Who helps you with eco-friendly action?",
        "What eco-friendly action is easy for you?",
        "What eco-friendly action is difficult for you?",
        "When do you usually think about eco-friendly action?",
        "Which is better for you: trees or plastic bags?"
      ],
      writing: [
        "What eco-friendly action is important or interesting to you?",
        "How do you use, do, or experience recycling in daily life?",
        "What do you like about saving water?",
        "Where do you usually see or use public transport?",
        "Who do you talk to about eco-friendly action?",
        "What is one good thing about trees?",
        "What is one problem with plastic bags?",
        "What eco-friendly action would you like to try?",
        "What eco-friendly action do people around you often use?",
        "Which do you prefer: a reusable bottle or a clean park?"
      ],
    },
    A2: {
      speaking: [
        "Why is recycling useful for you?",
        "How often do you use, do, or think about saving water?",
        "What should beginners know about eco-friendly action?",
        "Which is more useful: public transport or trees? Why?",
        "What is a good way to enjoy eco-friendly action?",
        "How can plastic bags help people?",
        "What problem can happen with a reusable bottle?",
        "What eco-friendly action would you recommend to a friend?",
        "How is eco-friendly action different now from when you were younger?",
        "What would you like to learn about eco-friendly action?"
      ],
      writing: [
        "Why do many people like recycling?",
        "How can saving water make daily life easier?",
        "What are two good points about public transport?",
        "What is one bad point about trees?",
        "Which eco-friendly action would you choose for a busy day?",
        "How can people use plastic bags in a better way?",
        "What advice would you give to someone trying a reusable bottle for the first time?",
        "What eco-friendly action is popular in your country?",
        "How does a clean park help people communicate or work together?",
        "What small change related to eco-friendly action could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has eco-friendly action changed people's daily lives?",
        "Why do some people enjoy recycling while others do not?",
        "What is one problem in your town that eco-friendly action can improve?",
        "How can people make better choices about saving water?",
        "What are the good and bad sides of public transport?",
        "Why is climate change important for ordinary people?",
        "What should young people learn about eco-friendly action?",
        "How can families or schools support better habits around eco-friendly action?",
        "What mistake do people often make with trees?",
        "How might eco-friendly action be different ten years from now?"
      ],
      writing: [
        "How does eco-friendly action affect students or young people?",
        "Why might recycling be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to eco-friendly action?",
        "How can people balance convenience and responsibility when using or doing saving water?",
        "What are two reasons why climate change matters today?",
        "How can communities encourage better decisions about eco-friendly action?",
        "What should schools teach about public transport?",
        "How does money, time, or access change people's choices about eco-friendly action?",
        "What example shows the positive side of trees?",
        "What example shows the negative side of plastic bags?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in eco-friendly action: convenience or responsibility?",
        "Should schools or governments do more about climate change? Why?",
        "How can people enjoy the benefits of recycling while reducing the risks?",
        "What is one strong argument for and against stricter rules on plastic waste?",
        "How does clean energy affect ordinary families or students?",
        "Is personal choice enough to solve problems related to eco-friendly action?",
        "How should leaders explain difficult decisions about biodiversity?",
        "What trade-off appears when people choose between cost and quality in eco-friendly action?",
        "How can technology or social change improve eco-friendly action?",
        "What kind of evidence would change your opinion about sustainable cities?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in eco-friendly action?",
        "Which policy would be most effective for addressing climate change, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about recycling?",
        "What are the strongest arguments on both sides of the debate about plastic waste?",
        "How can institutions build trust when dealing with clean energy?",
        "Should companies, governments, or individuals take the main responsibility for problems related to eco-friendly action?",
        "How does inequality influence people's choices or opportunities in eco-friendly action?",
        "What would a fair compromise look like in a disagreement about biodiversity?",
        "How can education change public behavior related to sustainable cities?",
        "What unintended consequence could come from trying to improve eco-friendly action?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in eco-friendly action?",
        "What responsibility do institutions have when decisions about climate change affect vulnerable people?",
        "How can policymakers respond to plastic waste without creating new unfairness?",
        "What should count as success when improving eco-friendly action?",
        "How can experts communicate uncertainty about clean energy to the public?",
        "When should individual freedom be limited for the sake of biodiversity?",
        "How can international cooperation help solve problems related to sustainable cities?",
        "What role should public trust play in decisions about eco-friendly action?",
        "How can society avoid focusing only on efficiency in eco-friendly action?",
        "What kind of leadership is needed when values conflict in eco-friendly action?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in eco-friendly action?",
        "What principles should guide decisions when climate change conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in eco-friendly action are actually fair?",
        "What is the most persuasive case for prioritizing plastic waste over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for clean energy?",
        "What limits should be placed on powerful organizations involved in eco-friendly action?",
        "How can public systems prepare for long-term challenges connected to biodiversity?",
        "What trade-off in eco-friendly action is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about sustainable cities?",
        "What lesson from history or current society helps explain a challenge in eco-friendly action?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in eco-friendly action?",
        "How should society act when evidence about climate change is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of eco-friendly action differently?",
        "How can long-term responsibility be taken seriously in debates about plastic waste?",
        "When does compromise in eco-friendly action become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about clean energy?",
        "What hidden assumptions shape public debates about eco-friendly action?",
        "How can decision-makers avoid solving one problem while deepening another in biodiversity?",
        "What responsibility do powerful countries or organizations have in shaping eco-friendly action?",
        "How should human dignity influence the future of eco-friendly action?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in eco-friendly action?",
        "How should societies make decisions about climate change when no option is fully fair?",
        "What deeper value conflict lies beneath debates about plastic waste?",
        "How can institutions remain legitimate when they must make unpopular decisions about eco-friendly action?",
        "What responsibilities do present generations have when their choices in eco-friendly action affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about clean energy?",
        "When does neutrality become impossible in decisions about eco-friendly action?",
        "How can society distinguish responsible innovation from reckless experimentation in biodiversity?",
        "What would a humane future for eco-friendly action require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about sustainable cities?"
      ],
    },
  },


  "Law & Politics": {
    A1: {
      speaking: [
        "If your school made a rule banning phones during lunch, would you like it?",
        "Have you ever followed a traffic rule that helped keep people safe?",
        "What is one funny or strange rule you know?",
        "Would you rather be a class leader or vote for one?",
        "What rule at school is easy to follow for you?",
        "What rule do children often forget?",
        "Have you ever listened to a speech by a teacher or leader?",
        "Would you enjoy joining a simple community meeting? Why?",
        "What is one rule you think every city should have?",
        "Which is more interesting to you: elections or speeches?"
      ],
      writing: [
        "What school rule do you think helps students the most?",
        "Describe a time when a traffic rule protected you or someone else.",
        "What kind of leader do you like: strict or friendly?",
        "What is one rule that people in your town follow every day?",
        "Would you like to give a speech in front of many people? Why or why not?",
        "What makes voting important, even for ordinary people?",
        "What rule would you create for your classroom?",
        "Have you ever seen people disagree about a rule?",
        "Which is more useful: TV news or community meetings?",
        "What law or rule would make daily life easier for students?"
      ],
    },

    A2: {
      speaking: [
        "Why do some students dislike strict school rules?",
        "If people stopped following traffic rules for one day, what could happen?",
        "What should a good leader do during a difficult situation?",
        "Would you rather vote online or at a voting station? Why?",
        "What makes a speech interesting instead of boring?",
        "Have you ever heard fake news or incorrect information online?",
        "What is one law that helps people feel safe?",
        "Why do communities sometimes argue about rules?",
        "If you could change one rule in your city, what would it be?",
        "Why is it important for people to share their opinions?"
      ],
      writing: [
        "Why do schools need rules even if students dislike them?",
        "Describe a situation where traffic laws are especially important.",
        "What qualities make people trust a political leader?",
        "Do you think young people should learn more about voting at school?",
        "How can speeches influence people's feelings or decisions?",
        "What problems can happen when false information spreads online?",
        "What is one law in your country that you think works well?",
        "Should communities always follow the majority opinion? Why or why not?",
        "How can news change the way people think about politics?",
        "What political or legal topic would you like to learn more about?"
      ],
    },

    B1: {
      speaking: [
        "Why do some people break laws even when they know the risks?",
        "Should schools punish students for comments made online outside school?",
        "What can happen when people lose trust in politicians?",
        "Why do some voters choose emotional speeches over detailed policies?",
        "How can social media change political opinions?",
        "Should governments do more to stop misinformation online?",
        "What is one law that became outdated because society changed?",
        "How can communities balance safety and personal freedom?",
        "What makes people support strong leaders during crises?",
        "How might voting change in the future because of technology?"
      ],
      writing: [
        "Why is freedom of speech important in democratic societies?",
        "Should governments limit dangerous misinformation online?",
        "Describe a political or legal issue that affects young people today.",
        "How can unfair laws damage trust in society?",
        "What are the advantages and disadvantages of online voting?",
        "Why do political debates often become emotional instead of logical?",
        "How can schools encourage students to become responsible citizens?",
        "What role should journalists play during elections?",
        "What example shows how laws can positively change society?",
        "What example shows how political decisions can create new problems?"
      ],
    },

    B2: {
      speaking: [
        "Should freedom of speech protect offensive opinions?",
        "How dangerous is misinformation during elections?",
        "Would stricter laws actually reduce online hate speech?",
        "Why do some societies accept surveillance cameras more than others?",
        "Should famous influencers be responsible for political misinformation they spread?",
        "How can governments balance national security and personal privacy?",
        "Why do populist leaders often become popular during economic problems?",
        "Should voting be mandatory in democratic countries?",
        "How does political polarization affect ordinary families and friendships?",
        "What trade-offs appear when governments try to increase public safety?"
      ],
      writing: [
        "How should democratic societies respond to misinformation without harming free speech?",
        "Should governments have stronger power during national emergencies?",
        "What are the strongest arguments for and against mandatory voting?",
        "How does social media change the quality of political discussion?",
        "Should political leaders be judged more by results or by ethics?",
        "How can legal systems remain fair when public opinion becomes emotional?",
        "What are the risks of giving technology companies too much influence over public debate?",
        "How does economic inequality affect political participation?",
        "What compromise could balance privacy and national security?",
        "What unintended consequences can appear when governments introduce stricter laws?"
      ],
    },

    C1: {
      speaking: [
        "How can societies protect free speech while limiting harmful extremism?",
        "Should governments ever censor information during national crises?",
        "Why do many democracies struggle with political polarization?",
        "How can institutions rebuild trust after corruption scandals?",
        "Should courts follow public opinion when making controversial decisions?",
        "How does fear influence political decision-making?",
        "What responsibilities do media organizations have during elections?",
        "How should societies respond when laws conflict with cultural traditions?",
        "Can strong leadership become dangerous even when it begins with good intentions?",
        "How can democratic systems adapt to the speed of online information?"
      ],
      writing: [
        "How should democratic societies balance security, privacy, and freedom in the digital age?",
        "What principles should guide governments when regulating online political content?",
        "How can societies distinguish legitimate criticism from harmful misinformation?",
        "What are the long-term dangers of political polarization?",
        "How should legal systems respond when public morality changes faster than laws?",
        "What role should education play in protecting democracy?",
        "How can governments maintain legitimacy during unpopular crises?",
        "What lessons can modern societies learn from historical failures of democracy?",
        "How should countries respond when freedom and public safety come into conflict?",
        "What hidden assumptions often shape political debates about justice and rights?"
      ],
    },

    C2: {
      speaking: [
        "When does protecting democracy justify limiting democratic freedoms?",
        "How should societies respond when truth itself becomes politically contested?",
        "Can complete neutrality ever exist in journalism, law, or politics?",
        "How should governments act when expert evidence conflicts with public opinion?",
        "What moral responsibilities do powerful nations have toward weaker ones?",
        "How does technology reshape the meaning of political freedom?",
        "When does compromise strengthen democracy, and when does it weaken it?",
        "How should societies judge historical figures whose actions conflict with modern values?",
        "What deeper fears or assumptions often drive political extremism?",
        "How can legal systems remain legitimate during periods of rapid social change?"
      ],
      writing: [
        "What ethical framework best balances freedom, security, and equality in modern democracies?",
        "How should democratic societies respond when misinformation spreads faster than truth?",
        "What responsibilities do citizens have in preserving democratic institutions?",
        "How can societies prevent emergency powers from becoming permanent political tools?",
        "What tensions exist between justice, stability, and public opinion?",
        "How should governments handle conflicts between national identity and multiculturalism?",
        "What role should international organizations play in defending human rights?",
        "How can societies distinguish responsible political leadership from manipulative populism?",
        "What would a truly fair legal system require beyond equal laws?",
        "How should future generations evaluate the political decisions made today?"
      ],
    },
  },
  "Engineering": {
    A1: {
      speaking: [
        "What is one machine or tool you like or think about often?",
        "What do you like about a bridge?",
        "Do you use a train in your daily life?",
        "What is one machine or tool that feels new or interesting to you?",
        "Where do you usually use an elevator?",
        "Who helps you with machine or tool?",
        "What machine or tool is easy for you?",
        "What machine or tool is difficult for you?",
        "When do you usually think about machine or tool?",
        "Which is better for you: a phone charger or a robot?"
      ],
      writing: [
        "What machine or tool is important or interesting to you?",
        "How do you use, do, or experience a bridge in daily life?",
        "What do you like about a train?",
        "Where do you usually see or use an elevator?",
        "Who do you talk to about machine or tool?",
        "What is one good thing about a phone charger?",
        "What is one problem with a robot?",
        "What machine or tool would you like to try?",
        "What machine or tool do people around you often use?",
        "Which do you prefer: a water filter or a bicycle?"
      ],
    },
    A2: {
      speaking: [
        "Why is a bridge useful for you?",
        "How often do you use, do, or think about a train?",
        "What should beginners know about machine or tool?",
        "Which is more useful: an elevator or a phone charger? Why?",
        "What is a good way to enjoy machine or tool?",
        "How can a robot help people?",
        "What problem can happen with a water filter?",
        "What machine or tool would you recommend to a friend?",
        "How is machine or tool different now from when you were younger?",
        "What would you like to learn about machine or tool?"
      ],
      writing: [
        "Why do many people like a bridge?",
        "How can a train make daily life easier?",
        "What are two good points about an elevator?",
        "What is one bad point about a phone charger?",
        "Which machine or tool would you choose for a busy day?",
        "How can people use a robot in a better way?",
        "What advice would you give to someone trying a water filter for the first time?",
        "What machine or tool is popular in your country?",
        "How does a bicycle help people communicate or work together?",
        "What small change related to machine or tool could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has machine or tool changed people's daily lives?",
        "Why do some people enjoy a bridge while others do not?",
        "What is one problem in daily life that machine or tool can improve?",
        "How can people make better choices about a train?",
        "What are the good and bad sides of an elevator?",
        "Why is safety important for ordinary people?",
        "What should young people learn about machine or tool?",
        "How can families or schools support better habits around machine or tool?",
        "What mistake do people often make with a phone charger?",
        "How might machine or tool be different ten years from now?"
      ],
      writing: [
        "How does machine or tool affect students or young people?",
        "Why might a bridge be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to machine or tool?",
        "How can people balance convenience and responsibility when using or doing a train?",
        "What are two reasons why safety matters today?",
        "How can communities encourage better decisions about machine or tool?",
        "What should schools teach about an elevator?",
        "How does money, time, or access change people's choices about machine or tool?",
        "What example shows the positive side of a phone charger?",
        "What example shows the negative side of a robot?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in machine or tool: convenience or responsibility?",
        "Should schools or governments do more about safety? Why?",
        "How can people enjoy the benefits of a bridge while reducing the risks?",
        "What is one strong argument for and against stricter rules on cost?",
        "How does sustainability affect ordinary families or students?",
        "Is personal choice enough to solve problems related to machine or tool?",
        "How should leaders explain difficult decisions about infrastructure?",
        "What trade-off appears when people choose between cost and quality in machine or tool?",
        "How can technology or social change improve machine or tool?",
        "What kind of evidence would change your opinion about accessibility?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in machine or tool?",
        "Which policy would be most effective for addressing safety, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about a bridge?",
        "What are the strongest arguments on both sides of the debate about cost?",
        "How can institutions build trust when dealing with sustainability?",
        "Should companies, governments, or individuals take the main responsibility for problems related to machine or tool?",
        "How does inequality influence people's choices or opportunities in machine or tool?",
        "What would a fair compromise look like in a disagreement about infrastructure?",
        "How can education change public behavior related to accessibility?",
        "What unintended consequence could come from trying to improve machine or tool?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in machine or tool?",
        "What responsibility do institutions have when decisions about safety affect vulnerable people?",
        "How can policymakers respond to cost without creating new unfairness?",
        "What should count as success when improving machine or tool?",
        "How can experts communicate uncertainty about sustainability to the public?",
        "When should individual freedom be limited for the sake of infrastructure?",
        "How can international cooperation help solve problems related to accessibility?",
        "What role should public trust play in decisions about machine or tool?",
        "How can society avoid focusing only on efficiency in machine or tool?",
        "What kind of leadership is needed when values conflict in machine or tool?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in machine or tool?",
        "What principles should guide decisions when safety conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in machine or tool are actually fair?",
        "What is the most persuasive case for prioritizing cost over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for sustainability?",
        "What limits should be placed on powerful organizations involved in machine or tool?",
        "How can public systems prepare for long-term challenges connected to infrastructure?",
        "What trade-off in machine or tool is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about accessibility?",
        "What lesson from history or current society helps explain a challenge in machine or tool?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in machine or tool?",
        "How should society act when evidence about safety is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of machine or tool differently?",
        "How can long-term responsibility be taken seriously in debates about cost?",
        "When does compromise in machine or tool become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about sustainability?",
        "What hidden assumptions shape public debates about machine or tool?",
        "How can decision-makers avoid solving one problem while deepening another in infrastructure?",
        "What responsibility do powerful countries or organizations have in shaping machine or tool?",
        "How should human dignity influence the future of machine or tool?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in machine or tool?",
        "How should societies make decisions about safety when no option is fully fair?",
        "What deeper value conflict lies beneath debates about cost?",
        "How can institutions remain legitimate when they must make unpopular decisions about machine or tool?",
        "What responsibilities do present generations have when their choices in machine or tool affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about sustainability?",
        "When does neutrality become impossible in decisions about machine or tool?",
        "How can society distinguish responsible innovation from reckless experimentation in infrastructure?",
        "What would a humane future for machine or tool require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about accessibility?"
      ],
    },
  },
  "Art & Culture": {
    A1: {
      speaking: [
        "What is one art or cultural activity you like or think about often?",
        "What do you like about music?",
        "Do you use a movie in your daily life?",
        "What is one art or cultural activity that feels new or interesting to you?",
        "Where do you usually use a museum?",
        "Who helps you with art or cultural activity?",
        "What art or cultural activity is easy for you?",
        "What art or cultural activity is difficult for you?",
        "When do you usually think about art or cultural activity?",
        "Which is better for you: a festival or dance?"
      ],
      writing: [
        "What art or cultural activity is important or interesting to you?",
        "How do you use, do, or experience music in daily life?",
        "What do you like about a movie?",
        "Where do you usually see or use a museum?",
        "Who do you talk to about art or cultural activity?",
        "What is one good thing about a festival?",
        "What is one problem with dance?",
        "What art or cultural activity would you like to try?",
        "What art or cultural activity do people around you often use?",
        "Which do you prefer: traditional food or a painting?"
      ],
    },
    A2: {
      speaking: [
        "Why is music useful for you?",
        "How often do you use, do, or think about a movie?",
        "What should beginners know about art or cultural activity?",
        "Which is more useful: a museum or a festival? Why?",
        "What is a good way to enjoy art or cultural activity?",
        "How can dance help people?",
        "What problem can happen with traditional food?",
        "What art or cultural activity would you recommend to a friend?",
        "How is art or cultural activity different now from when you were younger?",
        "What would you like to learn about art or cultural activity?"
      ],
      writing: [
        "Why do many people like music?",
        "How can a movie make daily life easier?",
        "What are two good points about a museum?",
        "What is one bad point about a festival?",
        "Which art or cultural activity would you choose for a busy day?",
        "How can people use dance in a better way?",
        "What advice would you give to someone trying traditional food for the first time?",
        "What art or cultural activity is popular in your country?",
        "How does a painting help people communicate or work together?",
        "What small change related to art or cultural activity could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has art or cultural activity changed people's daily lives?",
        "Why do some people enjoy music while others do not?",
        "What is one problem in your community that art or cultural activity can improve?",
        "How can people make better choices about a movie?",
        "What are the good and bad sides of a museum?",
        "Why is cultural preservation important for ordinary people?",
        "What should young people learn about art or cultural activity?",
        "How can families or schools support better habits around art or cultural activity?",
        "What mistake do people often make with a festival?",
        "How might art or cultural activity be different ten years from now?"
      ],
      writing: [
        "How does art or cultural activity affect students or young people?",
        "Why might music be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to art or cultural activity?",
        "How can people balance convenience and responsibility when using or doing a movie?",
        "What are two reasons why cultural preservation matters today?",
        "How can communities encourage better decisions about art or cultural activity?",
        "What should schools teach about a museum?",
        "How does money, time, or access change people's choices about art or cultural activity?",
        "What example shows the positive side of a festival?",
        "What example shows the negative side of dance?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in art or cultural activity: convenience or responsibility?",
        "Should schools or governments do more about cultural preservation? Why?",
        "How can people enjoy the benefits of music while reducing the risks?",
        "What is one strong argument for and against stricter rules on public art?",
        "How does controversial art affect ordinary families or students?",
        "Is personal choice enough to solve problems related to art or cultural activity?",
        "How should leaders explain difficult decisions about globalization?",
        "What trade-off appears when people choose between cost and quality in art or cultural activity?",
        "How can technology or social change improve art or cultural activity?",
        "What kind of evidence would change your opinion about creative freedom?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in art or cultural activity?",
        "Which policy would be most effective for addressing cultural preservation, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about music?",
        "What are the strongest arguments on both sides of the debate about public art?",
        "How can institutions build trust when dealing with controversial art?",
        "Should companies, governments, or individuals take the main responsibility for problems related to art or cultural activity?",
        "How does inequality influence people's choices or opportunities in art or cultural activity?",
        "What would a fair compromise look like in a disagreement about globalization?",
        "How can education change public behavior related to creative freedom?",
        "What unintended consequence could come from trying to improve art or cultural activity?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in art or cultural activity?",
        "What responsibility do institutions have when decisions about cultural preservation affect vulnerable people?",
        "How can policymakers respond to public art without creating new unfairness?",
        "What should count as success when improving art or cultural activity?",
        "How can experts communicate uncertainty about controversial art to the public?",
        "When should individual freedom be limited for the sake of globalization?",
        "How can international cooperation help solve problems related to creative freedom?",
        "What role should public trust play in decisions about art or cultural activity?",
        "How can society avoid focusing only on efficiency in art or cultural activity?",
        "What kind of leadership is needed when values conflict in art or cultural activity?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in art or cultural activity?",
        "What principles should guide decisions when cultural preservation conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in art or cultural activity are actually fair?",
        "What is the most persuasive case for prioritizing public art over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for controversial art?",
        "What limits should be placed on powerful organizations involved in art or cultural activity?",
        "How can public systems prepare for long-term challenges connected to globalization?",
        "What trade-off in art or cultural activity is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about creative freedom?",
        "What lesson from history or current society helps explain a challenge in art or cultural activity?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in art or cultural activity?",
        "How should society act when evidence about cultural preservation is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of art or cultural activity differently?",
        "How can long-term responsibility be taken seriously in debates about public art?",
        "When does compromise in art or cultural activity become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about controversial art?",
        "What hidden assumptions shape public debates about art or cultural activity?",
        "How can decision-makers avoid solving one problem while deepening another in globalization?",
        "What responsibility do powerful countries or organizations have in shaping art or cultural activity?",
        "How should human dignity influence the future of art or cultural activity?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in art or cultural activity?",
        "How should societies make decisions about cultural preservation when no option is fully fair?",
        "What deeper value conflict lies beneath debates about public art?",
        "How can institutions remain legitimate when they must make unpopular decisions about art or cultural activity?",
        "What responsibilities do present generations have when their choices in art or cultural activity affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about controversial art?",
        "When does neutrality become impossible in decisions about art or cultural activity?",
        "How can society distinguish responsible innovation from reckless experimentation in globalization?",
        "What would a humane future for art or cultural activity require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about creative freedom?"
      ],
    },
  },
  "Education & Learning": {
    A1: {
      speaking: [
        "What is one subject or learning method you like or think about often?",
        "What do you like about a favorite subject?",
        "Do you use an online lesson in your daily life?",
        "What is one subject or learning method that feels new or interesting to you?",
        "Where do you usually use a teacher?",
        "Who helps you with subject or learning method?",
        "What subject or learning method is easy for you?",
        "What subject or learning method is difficult for you?",
        "When do you usually think about subject or learning method?",
        "Which is better for you: a test or group work?"
      ],
      writing: [
        "What subject or learning method is important or interesting to you?",
        "How do you use, do, or experience a favorite subject in daily life?",
        "What do you like about an online lesson?",
        "Where do you usually see or use a teacher?",
        "Who do you talk to about subject or learning method?",
        "What is one good thing about a test?",
        "What is one problem with group work?",
        "What subject or learning method would you like to try?",
        "What subject or learning method do people around you often use?",
        "Which do you prefer: homework or a library?"
      ],
    },
    A2: {
      speaking: [
        "Why is a favorite subject useful for you?",
        "How often do you use, do, or think about an online lesson?",
        "What should beginners know about subject or learning method?",
        "Which is more useful: a teacher or a test? Why?",
        "What is a good way to enjoy subject or learning method?",
        "How can group work help people?",
        "What problem can happen with homework?",
        "What subject or learning method would you recommend to a friend?",
        "How is subject or learning method different now from when you were younger?",
        "What would you like to learn about subject or learning method?"
      ],
      writing: [
        "Why do many people like a favorite subject?",
        "How can an online lesson make daily life easier?",
        "What are two good points about a teacher?",
        "What is one bad point about a test?",
        "Which subject or learning method would you choose for a busy day?",
        "How can people use group work in a better way?",
        "What advice would you give to someone trying homework for the first time?",
        "What subject or learning method is popular in your country?",
        "How does a library help people communicate or work together?",
        "What small change related to subject or learning method could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has subject or learning method changed people's daily lives?",
        "Why do some people enjoy a favorite subject while others do not?",
        "What is one problem in school that subject or learning method can improve?",
        "How can people make better choices about an online lesson?",
        "What are the good and bad sides of a teacher?",
        "Why is standardized tests important for ordinary people?",
        "What should young people learn about subject or learning method?",
        "How can families or schools support better habits around subject or learning method?",
        "What mistake do people often make with a test?",
        "How might subject or learning method be different ten years from now?"
      ],
      writing: [
        "How does subject or learning method affect students or young people?",
        "Why might a favorite subject be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to subject or learning method?",
        "How can people balance convenience and responsibility when using or doing an online lesson?",
        "What are two reasons why standardized tests matters today?",
        "How can communities encourage better decisions about subject or learning method?",
        "What should schools teach about a teacher?",
        "How does money, time, or access change people's choices about subject or learning method?",
        "What example shows the positive side of a test?",
        "What example shows the negative side of group work?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in subject or learning method: convenience or responsibility?",
        "Should schools or governments do more about standardized tests? Why?",
        "How can people enjoy the benefits of a favorite subject while reducing the risks?",
        "What is one strong argument for and against stricter rules on online learning?",
        "How does AI tutors affect ordinary families or students?",
        "Is personal choice enough to solve problems related to subject or learning method?",
        "How should leaders explain difficult decisions about school pressure?",
        "What trade-off appears when people choose between cost and quality in subject or learning method?",
        "How can technology or social change improve subject or learning method?",
        "What kind of evidence would change your opinion about equal access?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in subject or learning method?",
        "Which policy would be most effective for addressing standardized tests, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about a favorite subject?",
        "What are the strongest arguments on both sides of the debate about online learning?",
        "How can institutions build trust when dealing with AI tutors?",
        "Should companies, governments, or individuals take the main responsibility for problems related to subject or learning method?",
        "How does inequality influence people's choices or opportunities in subject or learning method?",
        "What would a fair compromise look like in a disagreement about school pressure?",
        "How can education change public behavior related to equal access?",
        "What unintended consequence could come from trying to improve subject or learning method?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in subject or learning method?",
        "What responsibility do institutions have when decisions about standardized tests affect vulnerable people?",
        "How can policymakers respond to online learning without creating new unfairness?",
        "What should count as success when improving subject or learning method?",
        "How can experts communicate uncertainty about AI tutors to the public?",
        "When should individual freedom be limited for the sake of school pressure?",
        "How can international cooperation help solve problems related to equal access?",
        "What role should public trust play in decisions about subject or learning method?",
        "How can society avoid focusing only on efficiency in subject or learning method?",
        "What kind of leadership is needed when values conflict in subject or learning method?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in subject or learning method?",
        "What principles should guide decisions when standardized tests conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in subject or learning method are actually fair?",
        "What is the most persuasive case for prioritizing online learning over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for AI tutors?",
        "What limits should be placed on powerful organizations involved in subject or learning method?",
        "How can public systems prepare for long-term challenges connected to school pressure?",
        "What trade-off in subject or learning method is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about equal access?",
        "What lesson from history or current society helps explain a challenge in subject or learning method?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in subject or learning method?",
        "How should society act when evidence about standardized tests is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of subject or learning method differently?",
        "How can long-term responsibility be taken seriously in debates about online learning?",
        "When does compromise in subject or learning method become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about AI tutors?",
        "What hidden assumptions shape public debates about subject or learning method?",
        "How can decision-makers avoid solving one problem while deepening another in school pressure?",
        "What responsibility do powerful countries or organizations have in shaping subject or learning method?",
        "How should human dignity influence the future of subject or learning method?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in subject or learning method?",
        "How should societies make decisions about standardized tests when no option is fully fair?",
        "What deeper value conflict lies beneath debates about online learning?",
        "How can institutions remain legitimate when they must make unpopular decisions about subject or learning method?",
        "What responsibilities do present generations have when their choices in subject or learning method affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about AI tutors?",
        "When does neutrality become impossible in decisions about subject or learning method?",
        "How can society distinguish responsible innovation from reckless experimentation in school pressure?",
        "What would a humane future for subject or learning method require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about equal access?"
      ],
    },
  },
  "Sports & Fitness": {
    A1: {
      speaking: [
        "What is one sport or exercise you like or think about often?",
        "What do you like about soccer?",
        "Do you use running in your daily life?",
        "What is one sport or exercise that feels new or interesting to you?",
        "Where do you usually use swimming?",
        "Who helps you with sport or exercise?",
        "What sport or exercise is easy for you?",
        "What sport or exercise is difficult for you?",
        "When do you usually think about sport or exercise?",
        "Which is better for you: the gym or baseball?"
      ],
      writing: [
        "What sport or exercise is important or interesting to you?",
        "How do you use, do, or experience soccer in daily life?",
        "What do you like about running?",
        "Where do you usually see or use swimming?",
        "Who do you talk to about sport or exercise?",
        "What is one good thing about the gym?",
        "What is one problem with baseball?",
        "What sport or exercise would you like to try?",
        "What sport or exercise do people around you often use?",
        "Which do you prefer: basketball or yoga?"
      ],
    },
    A2: {
      speaking: [
        "Why is soccer useful for you?",
        "How often do you use, do, or think about running?",
        "What should beginners know about sport or exercise?",
        "Which is more useful: swimming or the gym? Why?",
        "What is a good way to enjoy sport or exercise?",
        "How can baseball help people?",
        "What problem can happen with basketball?",
        "What sport or exercise would you recommend to a friend?",
        "How is sport or exercise different now from when you were younger?",
        "What would you like to learn about sport or exercise?"
      ],
      writing: [
        "Why do many people like soccer?",
        "How can running make daily life easier?",
        "What are two good points about swimming?",
        "What is one bad point about the gym?",
        "Which sport or exercise would you choose for a busy day?",
        "How can people use baseball in a better way?",
        "What advice would you give to someone trying basketball for the first time?",
        "What sport or exercise is popular in your country?",
        "How does yoga help people communicate or work together?",
        "What small change related to sport or exercise could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has sport or exercise changed people's daily lives?",
        "Why do some people enjoy soccer while others do not?",
        "What is one problem in daily life that sport or exercise can improve?",
        "How can people make better choices about running?",
        "What are the good and bad sides of swimming?",
        "Why is athlete salaries important for ordinary people?",
        "What should young people learn about sport or exercise?",
        "How can families or schools support better habits around sport or exercise?",
        "What mistake do people often make with the gym?",
        "How might sport or exercise be different ten years from now?"
      ],
      writing: [
        "How does sport or exercise affect students or young people?",
        "Why might soccer be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to sport or exercise?",
        "How can people balance convenience and responsibility when using or doing running?",
        "What are two reasons why athlete salaries matters today?",
        "How can communities encourage better decisions about sport or exercise?",
        "What should schools teach about swimming?",
        "How does money, time, or access change people's choices about sport or exercise?",
        "What example shows the positive side of the gym?",
        "What example shows the negative side of baseball?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in sport or exercise: convenience or responsibility?",
        "Should schools or governments do more about athlete salaries? Why?",
        "How can people enjoy the benefits of soccer while reducing the risks?",
        "What is one strong argument for and against stricter rules on sports science?",
        "How does fair play affect ordinary families or students?",
        "Is personal choice enough to solve problems related to sport or exercise?",
        "How should leaders explain difficult decisions about youth sports?",
        "What trade-off appears when people choose between cost and quality in sport or exercise?",
        "How can technology or social change improve sport or exercise?",
        "What kind of evidence would change your opinion about national identity?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in sport or exercise?",
        "Which policy would be most effective for addressing athlete salaries, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about soccer?",
        "What are the strongest arguments on both sides of the debate about sports science?",
        "How can institutions build trust when dealing with fair play?",
        "Should companies, governments, or individuals take the main responsibility for problems related to sport or exercise?",
        "How does inequality influence people's choices or opportunities in sport or exercise?",
        "What would a fair compromise look like in a disagreement about youth sports?",
        "How can education change public behavior related to national identity?",
        "What unintended consequence could come from trying to improve sport or exercise?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in sport or exercise?",
        "What responsibility do institutions have when decisions about athlete salaries affect vulnerable people?",
        "How can policymakers respond to sports science without creating new unfairness?",
        "What should count as success when improving sport or exercise?",
        "How can experts communicate uncertainty about fair play to the public?",
        "When should individual freedom be limited for the sake of youth sports?",
        "How can international cooperation help solve problems related to national identity?",
        "What role should public trust play in decisions about sport or exercise?",
        "How can society avoid focusing only on efficiency in sport or exercise?",
        "What kind of leadership is needed when values conflict in sport or exercise?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in sport or exercise?",
        "What principles should guide decisions when athlete salaries conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in sport or exercise are actually fair?",
        "What is the most persuasive case for prioritizing sports science over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for fair play?",
        "What limits should be placed on powerful organizations involved in sport or exercise?",
        "How can public systems prepare for long-term challenges connected to youth sports?",
        "What trade-off in sport or exercise is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about national identity?",
        "What lesson from history or current society helps explain a challenge in sport or exercise?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in sport or exercise?",
        "How should society act when evidence about athlete salaries is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of sport or exercise differently?",
        "How can long-term responsibility be taken seriously in debates about sports science?",
        "When does compromise in sport or exercise become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about fair play?",
        "What hidden assumptions shape public debates about sport or exercise?",
        "How can decision-makers avoid solving one problem while deepening another in youth sports?",
        "What responsibility do powerful countries or organizations have in shaping sport or exercise?",
        "How should human dignity influence the future of sport or exercise?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in sport or exercise?",
        "How should societies make decisions about athlete salaries when no option is fully fair?",
        "What deeper value conflict lies beneath debates about sports science?",
        "How can institutions remain legitimate when they must make unpopular decisions about sport or exercise?",
        "What responsibilities do present generations have when their choices in sport or exercise affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about fair play?",
        "When does neutrality become impossible in decisions about sport or exercise?",
        "How can society distinguish responsible innovation from reckless experimentation in youth sports?",
        "What would a humane future for sport or exercise require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about national identity?"
      ],
    },
  },
  "Travel & Culture Exchange": {
    A1: {
      speaking: [
        "What is one place to visit you like or think about often?",
        "What do you like about a city?",
        "Do you use a museum in your daily life?",
        "What is one place to visit that feels new or interesting to you?",
        "Where do you usually use local food?",
        "Who helps you with place to visit?",
        "What place to visit is easy for you?",
        "What place to visit is difficult for you?",
        "When do you usually think about place to visit?",
        "Which is better for you: a train trip or a beach?"
      ],
      writing: [
        "What place to visit is important or interesting to you?",
        "How do you use, do, or experience a city in daily life?",
        "What do you like about a museum?",
        "Where do you usually see or use local food?",
        "Who do you talk to about place to visit?",
        "What is one good thing about a train trip?",
        "What is one problem with a beach?",
        "What place to visit would you like to try?",
        "What place to visit do people around you often use?",
        "Which do you prefer: a mountain or a festival?"
      ],
    },
    A2: {
      speaking: [
        "Why is a city useful for you?",
        "How often do you use, do, or think about a museum?",
        "What should beginners know about place to visit?",
        "Which is more useful: local food or a train trip? Why?",
        "What is a good way to enjoy place to visit?",
        "How can a beach help people?",
        "What problem can happen with a mountain?",
        "What place to visit would you recommend to a friend?",
        "How is place to visit different now from when you were younger?",
        "What would you like to learn about place to visit?"
      ],
      writing: [
        "Why do many people like a city?",
        "How can a museum make daily life easier?",
        "What are two good points about local food?",
        "What is one bad point about a train trip?",
        "Which place to visit would you choose for a busy day?",
        "How can people use a beach in a better way?",
        "What advice would you give to someone trying a mountain for the first time?",
        "What place to visit is popular in your country?",
        "How does a festival help people communicate or work together?",
        "What small change related to place to visit could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has place to visit changed people's daily lives?",
        "Why do some people enjoy a city while others do not?",
        "What is one problem in another country that place to visit can improve?",
        "How can people make better choices about a museum?",
        "What are the good and bad sides of local food?",
        "Why is overtourism important for ordinary people?",
        "What should young people learn about place to visit?",
        "How can families or schools support better habits around place to visit?",
        "What mistake do people often make with a train trip?",
        "How might place to visit be different ten years from now?"
      ],
      writing: [
        "How does place to visit affect students or young people?",
        "Why might a city be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to place to visit?",
        "How can people balance convenience and responsibility when using or doing a museum?",
        "What are two reasons why overtourism matters today?",
        "How can communities encourage better decisions about place to visit?",
        "What should schools teach about local food?",
        "How does money, time, or access change people's choices about place to visit?",
        "What example shows the positive side of a train trip?",
        "What example shows the negative side of a beach?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in place to visit: convenience or responsibility?",
        "Should schools or governments do more about overtourism? Why?",
        "How can people enjoy the benefits of a city while reducing the risks?",
        "What is one strong argument for and against stricter rules on cultural respect?",
        "How does sustainable travel affect ordinary families or students?",
        "Is personal choice enough to solve problems related to place to visit?",
        "How should leaders explain difficult decisions about host communities?",
        "What trade-off appears when people choose between cost and quality in place to visit?",
        "How can technology or social change improve place to visit?",
        "What kind of evidence would change your opinion about language barriers?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in place to visit?",
        "Which policy would be most effective for addressing overtourism, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about a city?",
        "What are the strongest arguments on both sides of the debate about cultural respect?",
        "How can institutions build trust when dealing with sustainable travel?",
        "Should companies, governments, or individuals take the main responsibility for problems related to place to visit?",
        "How does inequality influence people's choices or opportunities in place to visit?",
        "What would a fair compromise look like in a disagreement about host communities?",
        "How can education change public behavior related to language barriers?",
        "What unintended consequence could come from trying to improve place to visit?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in place to visit?",
        "What responsibility do institutions have when decisions about overtourism affect vulnerable people?",
        "How can policymakers respond to cultural respect without creating new unfairness?",
        "What should count as success when improving place to visit?",
        "How can experts communicate uncertainty about sustainable travel to the public?",
        "When should individual freedom be limited for the sake of host communities?",
        "How can international cooperation help solve problems related to language barriers?",
        "What role should public trust play in decisions about place to visit?",
        "How can society avoid focusing only on efficiency in place to visit?",
        "What kind of leadership is needed when values conflict in place to visit?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in place to visit?",
        "What principles should guide decisions when overtourism conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in place to visit are actually fair?",
        "What is the most persuasive case for prioritizing cultural respect over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for sustainable travel?",
        "What limits should be placed on powerful organizations involved in place to visit?",
        "How can public systems prepare for long-term challenges connected to host communities?",
        "What trade-off in place to visit is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about language barriers?",
        "What lesson from history or current society helps explain a challenge in place to visit?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in place to visit?",
        "How should society act when evidence about overtourism is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of place to visit differently?",
        "How can long-term responsibility be taken seriously in debates about cultural respect?",
        "When does compromise in place to visit become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about sustainable travel?",
        "What hidden assumptions shape public debates about place to visit?",
        "How can decision-makers avoid solving one problem while deepening another in host communities?",
        "What responsibility do powerful countries or organizations have in shaping place to visit?",
        "How should human dignity influence the future of place to visit?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in place to visit?",
        "How should societies make decisions about overtourism when no option is fully fair?",
        "What deeper value conflict lies beneath debates about cultural respect?",
        "How can institutions remain legitimate when they must make unpopular decisions about place to visit?",
        "What responsibilities do present generations have when their choices in place to visit affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about sustainable travel?",
        "When does neutrality become impossible in decisions about place to visit?",
        "How can society distinguish responsible innovation from reckless experimentation in host communities?",
        "What would a humane future for place to visit require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about language barriers?"
      ],
    },
  },
  "Food & Nutrition": {
    A1: {
      speaking: [
        "What is one food or meal you like or think about often?",
        "What do you like about breakfast?",
        "Do you use a rice dish in your daily life?",
        "What is one food or meal that feels new or interesting to you?",
        "Where do you usually use vegetables?",
        "Who helps you with food or meal?",
        "What food or meal is easy for you?",
        "What food or meal is difficult for you?",
        "When do you usually think about food or meal?",
        "Which is better for you: school lunch or traditional food?"
      ],
      writing: [
        "What food or meal is important or interesting to you?",
        "How do you use, do, or experience breakfast in daily life?",
        "What do you like about a rice dish?",
        "Where do you usually see or use vegetables?",
        "Who do you talk to about food or meal?",
        "What is one good thing about school lunch?",
        "What is one problem with traditional food?",
        "What food or meal would you like to try?",
        "What food or meal do people around you often use?",
        "Which do you prefer: a snack or home cooking?"
      ],
    },
    A2: {
      speaking: [
        "Why is breakfast useful for you?",
        "How often do you use, do, or think about a rice dish?",
        "What should beginners know about food or meal?",
        "Which is more useful: vegetables or school lunch? Why?",
        "What is a good way to enjoy food or meal?",
        "How can traditional food help people?",
        "What problem can happen with a snack?",
        "What food or meal would you recommend to a friend?",
        "How is food or meal different now from when you were younger?",
        "What would you like to learn about food or meal?"
      ],
      writing: [
        "Why do many people like breakfast?",
        "How can a rice dish make daily life easier?",
        "What are two good points about vegetables?",
        "What is one bad point about school lunch?",
        "Which food or meal would you choose for a busy day?",
        "How can people use traditional food in a better way?",
        "What advice would you give to someone trying a snack for the first time?",
        "What food or meal is popular in your country?",
        "How does home cooking help people communicate or work together?",
        "What small change related to food or meal could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has food or meal changed people's daily lives?",
        "Why do some people enjoy breakfast while others do not?",
        "What is one problem in daily life that food or meal can improve?",
        "How can people make better choices about a rice dish?",
        "What are the good and bad sides of vegetables?",
        "Why is food security important for ordinary people?",
        "What should young people learn about food or meal?",
        "How can families or schools support better habits around food or meal?",
        "What mistake do people often make with school lunch?",
        "How might food or meal be different ten years from now?"
      ],
      writing: [
        "How does food or meal affect students or young people?",
        "Why might breakfast be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to food or meal?",
        "How can people balance convenience and responsibility when using or doing a rice dish?",
        "What are two reasons why food security matters today?",
        "How can communities encourage better decisions about food or meal?",
        "What should schools teach about vegetables?",
        "How does money, time, or access change people's choices about food or meal?",
        "What example shows the positive side of school lunch?",
        "What example shows the negative side of traditional food?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in food or meal: convenience or responsibility?",
        "Should schools or governments do more about food security? Why?",
        "How can people enjoy the benefits of breakfast while reducing the risks?",
        "What is one strong argument for and against stricter rules on healthy eating?",
        "How does food waste affect ordinary families or students?",
        "Is personal choice enough to solve problems related to food or meal?",
        "How should leaders explain difficult decisions about sustainable farming?",
        "What trade-off appears when people choose between cost and quality in food or meal?",
        "How can technology or social change improve food or meal?",
        "What kind of evidence would change your opinion about school meals?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in food or meal?",
        "Which policy would be most effective for addressing food security, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about breakfast?",
        "What are the strongest arguments on both sides of the debate about healthy eating?",
        "How can institutions build trust when dealing with food waste?",
        "Should companies, governments, or individuals take the main responsibility for problems related to food or meal?",
        "How does inequality influence people's choices or opportunities in food or meal?",
        "What would a fair compromise look like in a disagreement about sustainable farming?",
        "How can education change public behavior related to school meals?",
        "What unintended consequence could come from trying to improve food or meal?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in food or meal?",
        "What responsibility do institutions have when decisions about food security affect vulnerable people?",
        "How can policymakers respond to healthy eating without creating new unfairness?",
        "What should count as success when improving food or meal?",
        "How can experts communicate uncertainty about food waste to the public?",
        "When should individual freedom be limited for the sake of sustainable farming?",
        "How can international cooperation help solve problems related to school meals?",
        "What role should public trust play in decisions about food or meal?",
        "How can society avoid focusing only on efficiency in food or meal?",
        "What kind of leadership is needed when values conflict in food or meal?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in food or meal?",
        "What principles should guide decisions when food security conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in food or meal are actually fair?",
        "What is the most persuasive case for prioritizing healthy eating over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for food waste?",
        "What limits should be placed on powerful organizations involved in food or meal?",
        "How can public systems prepare for long-term challenges connected to sustainable farming?",
        "What trade-off in food or meal is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about school meals?",
        "What lesson from history or current society helps explain a challenge in food or meal?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in food or meal?",
        "How should society act when evidence about food security is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of food or meal differently?",
        "How can long-term responsibility be taken seriously in debates about healthy eating?",
        "When does compromise in food or meal become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about food waste?",
        "What hidden assumptions shape public debates about food or meal?",
        "How can decision-makers avoid solving one problem while deepening another in sustainable farming?",
        "What responsibility do powerful countries or organizations have in shaping food or meal?",
        "How should human dignity influence the future of food or meal?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in food or meal?",
        "How should societies make decisions about food security when no option is fully fair?",
        "What deeper value conflict lies beneath debates about healthy eating?",
        "How can institutions remain legitimate when they must make unpopular decisions about food or meal?",
        "What responsibilities do present generations have when their choices in food or meal affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about food waste?",
        "When does neutrality become impossible in decisions about food or meal?",
        "How can society distinguish responsible innovation from reckless experimentation in sustainable farming?",
        "What would a humane future for food or meal require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about school meals?"
      ],
    },
  },
  "Social Media & Digital Life": {
    A1: {
      speaking: [
        "What is one online habit you like or think about often?",
        "What do you like about a social media app?",
        "Do you use a message in your daily life?",
        "What is one online habit that feels new or interesting to you?",
        "Where do you usually use an online video?",
        "Who helps you with online habit?",
        "What online habit is easy for you?",
        "What online habit is difficult for you?",
        "When do you usually think about online habit?",
        "Which is better for you: a photo post or a group chat?"
      ],
      writing: [
        "What online habit is important or interesting to you?",
        "How do you use, do, or experience a social media app in daily life?",
        "What do you like about a message?",
        "Where do you usually see or use an online video?",
        "Who do you talk to about online habit?",
        "What is one good thing about a photo post?",
        "What is one problem with a group chat?",
        "What online habit would you like to try?",
        "What online habit do people around you often use?",
        "Which do you prefer: a short video or an online friend?"
      ],
    },
    A2: {
      speaking: [
        "Why is a social media app useful for you?",
        "How often do you use, do, or think about a message?",
        "What should beginners know about online habit?",
        "Which is more useful: an online video or a photo post? Why?",
        "What is a good way to enjoy online habit?",
        "How can a group chat help people?",
        "What problem can happen with a short video?",
        "What online habit would you recommend to a friend?",
        "How is online habit different now from when you were younger?",
        "What would you like to learn about online habit?"
      ],
      writing: [
        "Why do many people like a social media app?",
        "How can a message make daily life easier?",
        "What are two good points about an online video?",
        "What is one bad point about a photo post?",
        "Which online habit would you choose for a busy day?",
        "How can people use a group chat in a better way?",
        "What advice would you give to someone trying a short video for the first time?",
        "What online habit is popular in your country?",
        "How does an online friend help people communicate or work together?",
        "What small change related to online habit could improve your day?"
      ],
    },
    B1: {
      speaking: [
        "How has online habit changed people's daily lives?",
        "Why do some people enjoy a social media app while others do not?",
        "What is one problem in daily life that online habit can improve?",
        "How can people make better choices about a message?",
        "What are the good and bad sides of an online video?",
        "Why is privacy important for ordinary people?",
        "What should young people learn about online habit?",
        "How can families or schools support better habits around online habit?",
        "What mistake do people often make with a photo post?",
        "How might online habit be different ten years from now?"
      ],
      writing: [
        "How does online habit affect students or young people?",
        "Why might a social media app be helpful in some situations but not in others?",
        "What is one realistic solution to a problem related to online habit?",
        "How can people balance convenience and responsibility when using or doing a message?",
        "What are two reasons why privacy matters today?",
        "How can communities encourage better decisions about online habit?",
        "What should schools teach about an online video?",
        "How does money, time, or access change people's choices about online habit?",
        "What example shows the positive side of a photo post?",
        "What example shows the negative side of a group chat?"
      ],
    },
    B2: {
      speaking: [
        "Which matters more in online habit: convenience or responsibility?",
        "Should schools or governments do more about privacy? Why?",
        "How can people enjoy the benefits of a social media app while reducing the risks?",
        "What is one strong argument for and against stricter rules on screen time?",
        "How does online identity affect ordinary families or students?",
        "Is personal choice enough to solve problems related to online habit?",
        "How should leaders explain difficult decisions about misinformation?",
        "What trade-off appears when people choose between cost and quality in online habit?",
        "How can technology or social change improve online habit?",
        "What kind of evidence would change your opinion about mental health?"
      ],
      writing: [
        "How should society balance individual freedom and public responsibility in online habit?",
        "Which policy would be most effective for addressing privacy, and why?",
        "How do short-term benefits and long-term risks conflict in decisions about a social media app?",
        "What are the strongest arguments on both sides of the debate about screen time?",
        "How can institutions build trust when dealing with online identity?",
        "Should companies, governments, or individuals take the main responsibility for problems related to online habit?",
        "How does inequality influence people's choices or opportunities in online habit?",
        "What would a fair compromise look like in a disagreement about misinformation?",
        "How can education change public behavior related to mental health?",
        "What unintended consequence could come from trying to improve online habit?"
      ],
    },
    C1: {
      speaking: [
        "How should society balance progress and caution in online habit?",
        "What responsibility do institutions have when decisions about privacy affect vulnerable people?",
        "How can policymakers respond to screen time without creating new unfairness?",
        "What should count as success when improving online habit?",
        "How can experts communicate uncertainty about online identity to the public?",
        "When should individual freedom be limited for the sake of misinformation?",
        "How can international cooperation help solve problems related to mental health?",
        "What role should public trust play in decisions about online habit?",
        "How can society avoid focusing only on efficiency in online habit?",
        "What kind of leadership is needed when values conflict in online habit?"
      ],
      writing: [
        "How should governments design policies that encourage innovation while protecting people from risks in online habit?",
        "What principles should guide decisions when privacy conflicts with economic or personal interests?",
        "How can society evaluate whether reforms in online habit are actually fair?",
        "What is the most persuasive case for prioritizing screen time over short-term convenience?",
        "How should experts, citizens, and policymakers share responsibility for online identity?",
        "What limits should be placed on powerful organizations involved in online habit?",
        "How can public systems prepare for long-term challenges connected to misinformation?",
        "What trade-off in online habit is often ignored in public debate?",
        "How can communities protect minority interests when making decisions about mental health?",
        "What lesson from history or current society helps explain a challenge in online habit?"
      ],
    },
    C2: {
      speaking: [
        "What moral trade-offs should guide difficult decisions in online habit?",
        "How should society act when evidence about privacy is incomplete but the stakes are high?",
        "What does fairness mean when different groups experience the costs and benefits of online habit differently?",
        "How can long-term responsibility be taken seriously in debates about screen time?",
        "When does compromise in online habit become necessary, and when does it become harmful?",
        "How should societies handle conflicts between expert judgment and public opinion about online identity?",
        "What hidden assumptions shape public debates about online habit?",
        "How can decision-makers avoid solving one problem while deepening another in misinformation?",
        "What responsibility do powerful countries or organizations have in shaping online habit?",
        "How should human dignity influence the future of online habit?"
      ],
      writing: [
        "What ethical framework best addresses conflicts between progress, fairness, and responsibility in online habit?",
        "How should societies make decisions about privacy when no option is fully fair?",
        "What deeper value conflict lies beneath debates about screen time?",
        "How can institutions remain legitimate when they must make unpopular decisions about online habit?",
        "What responsibilities do present generations have when their choices in online habit affect people who cannot participate in today's debate?",
        "How should global inequality shape the way we think about online identity?",
        "When does neutrality become impossible in decisions about online habit?",
        "How can society distinguish responsible innovation from reckless experimentation in misinformation?",
        "What would a humane future for online habit require beyond technical or economic success?",
        "How should conflicting ideas of justice be handled in a debate about mental health?"
      ],
    },
  },
};